require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'printflow_secreto_dev';
// Configuración API Oficial de Meta (WhatsApp Cloud API)
const META_TOKEN = process.env.META_TOKEN;
const META_PHONE_ID = process.env.META_PHONE_ID;
// Configuración Gmail API
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;

async function enviarWhatsAppReal(pedido, tallerConfig, mensajePersonalizado = null) {
  try {
    // Si el taller no configuró sus credenciales, no podemos enviar
    if (!tallerConfig.metaToken || !tallerConfig.metaPhoneId) {
      console.log(`[WhatsApp Omitido] Taller ${tallerConfig.nombre} no tiene credenciales configuradas.`);
      return false;
    }
    
    let mensaje;
    if (mensajePersonalizado) {
      mensaje = mensajePersonalizado;
    } else {
      // Reemplazamos las variables en la plantilla del taller
      mensaje = (tallerConfig.plantillaMensaje || "Hola {cliente}, tu pedido #{orden} está listo.")
        .replace(/{taller}/g, tallerConfig.nombre)
        .replace(/{cliente}/g, `${pedido.nombreCliente} ${pedido.apellidoCliente}`)
        .replace(/{orden}/g, pedido.numeroOrden)
        .replace(/{entrega}/g, pedido.metodoEntrega === 'retiro' ? 'retiro' : 'envío');
    }
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${tallerConfig.metaPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tallerConfig.metaToken}`
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: pedido.telefono,
        type: "text",
        text: { body: mensaje }
      })
    });
    
    const data = await response.json();
    if (data.messages && data.messages[0]) {
      console.log(`[WhatsApp Enviado] Pedido #${pedido.numeroOrden} - Taller: ${tallerConfig.nombre}`);
      return true;
    } else {
      console.error('Error de Meta API:', data);
      return false;
    }
  } catch (error) {
    console.error('Error al enviar WhatsApp:', error);
    return false;
  }
}
// =======================================================
// EL RELOJ DEL SERVIDOR (Worker)
// =======================================================
setInterval(async () => {
  try {
    const ahora = new Date();
    const pedidosListos = await prisma.pedido.findMany({
      where: { estado: 'finalizado', notificacionEnviada: false, notificacionProgramadaPara: { lte: ahora } }
    });

        for (const pedido of pedidosListos) {
      const taller = await prisma.taller.findUnique({ where: { id: pedido.tallerId } });
      const enviado = await enviarWhatsAppReal(pedido, taller);
      
      if (enviado) {
        await prisma.pedido.update({
          where: { id: pedido.id },
          data: { notificacionEnviada: true }
        });
      }
    }
  } catch (error) {
    console.error('Error en el reloj de notificaciones:', error);
  }
}, 10000);

// =======================================================
// MIDDLEWARE DE SEGURIDAD
// =======================================================
const verificarToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader) return res.status(401).json({ error: 'Acceso denegado. No hay token.' });
  const token = authHeader.replace('Bearer ', '');
  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    req.tallerId = verificado.tallerId;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};
// =======================================================
// EL REVISOR DE GMAIL (Worker)
// =======================================================
setInterval(async () => {
  try {
    // Buscamos todos los talleres que tengan Gmail conectado
    const talleres = await prisma.taller.findMany({
      where: { gmailAccessToken: { not: null }, gmailRefreshToken: { not: null } }
    });

    for (const taller of talleres) {
      // Configuramos el cliente de Google con los tokens de este taller
      oauth2Client.setCredentials({
        access_token: taller.gmailAccessToken,
        refresh_token: taller.gmailRefreshToken
      });

      // Si el token expira, Google automáticamente usa el refresh token para pedir uno nuevo
      oauth2Client.on('tokens', (tokens) => {
        if (tokens.access_token) {
          prisma.taller.update({ where: { id: taller.id }, data: { gmailAccessToken: tokens.access_token } });
        }
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // 1. FILTRO A LA ENTRADA (API de Gmail): Ignora listas, noreply y correos comunes de bots
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'has:attachment is:unread newer_than:1d -list:* -from:noreply -from:no-reply -from:notificaciones -from:info -from:soporte',
        maxResults: 3
      });

      if (!res.data.messages) continue; // Si no hay mails, saltamos al siguiente taller

      // Lista de prefijos de correo que no son clientes
      const prefijosBan = ['facturacion', 'ventas', 'admin', 'contacto', 'notificaciones'];
      
      for (const msg of res.data.messages) {
        const email = await gmail.users.messages.get({ userId: 'me', id: msg.id });
        
        let from = '';
        let subject = '';
        let attachments = [];
        let isAutoReply = false;

        const headers = email.data.payload.headers;
        for (const h of headers) {
          if (h.name === 'From') from = h.value;
          if (h.name === 'Subject') subject = h.value;
          
          // 2. FILTRO DE ENCABEZADOS (RFC): Si tiene List-Unsubscribe, es boletín/factura
          if (h.name === 'List-Unsubscribe') isAutoReply = true;
        }

        let emailMatch = from.match(/<(.+)>/);
        let fromEmail = emailMatch ? emailMatch[1] : from;
        let emailPrefix = fromEmail.split('@')[0].toLowerCase();

        // Si es auto-reply o viene de un correo genérico de empresa, lo ignoramos
        if (isAutoReply || prefijosBan.some(prefix => emailPrefix.includes(prefix))) {
          await gmail.users.messages.modify({ userId: 'me', id: msg.id, requestBody: { removeLabelIds: ['UNREAD'] } });
          continue;
        }

        // Buscamos los archivos adjuntos
        if (email.data.payload.parts) {
          for (const part of email.data.payload.parts) {
            if (part.filename && part.filename.length > 0) {
              attachments.push(part.filename);
            }
          }
        }

        // Lógica de automatización
        let numeroOrden = String(Math.floor(Math.random() * 9000) + 1000);
        let nombreCompleto = from.split('<')[0].trim().split(' ');

        // Creamos el pedido en estado "pago_pendiente"
        await prisma.pedido.create({
          data: {
            tallerId: taller.id,
            numeroOrden: numeroOrden,
            nombreCliente: nombreCompleto[0] || 'Cliente',
            apellidoCliente: nombreCompleto.slice(1).join(' ') || 'Gmail',
            emailCliente: fromEmail,
            telefono: '0000000000', // Pendiente de que el dueño lo complete
            detalle: subject || 'Diseño recibido por Gmail',
            metodoEntrega: 'retiro',
            estado: 'pago_pendiente', // NUEVO ESTADO
            archivosAdjuntos: attachments.join(', ') || 'Sin archivos'
          }
        });

        // Marcamos el mail como "Leído" para que no lo vuelva a procesar
        await gmail.users.messages.modify({ userId: 'me', id: msg.id, requestBody: { removeLabelIds: ['UNREAD'] } });
        console.log(`[Gmail] Pedido en espera de pago creado para ${taller.nombre}: ${attachments.join(', ')}`);
      }
    }
  } catch (error) {
    console.error('Error en el revisor de Gmail:', error);
  }
}, 60000); // 60000 milisegundos = 1 minuto
// =======================================================
// RUTAS DE AUTENTICACIÓN
// =======================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, usuario, password } = req.body;
    if (!nombre || !usuario || !password) return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const nuevoTaller = await prisma.taller.create({ data: { nombre, usuario, password: hashedPassword } });
    res.status(201).json({ message: 'Taller registrado correctamente', tallerId: nuevoTaller.id });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const taller = await prisma.taller.findUnique({ where: { usuario } });
    if (!taller) return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
    const passwordValido = await bcrypt.compare(password, taller.password);
    if (!passwordValido) return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
    const token = jwt.sign({ tallerId: taller.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, taller: { id: taller.id, nombre: taller.nombre, usuario: taller.usuario } });
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =======================================================
// RUTAS DE PEDIDOS
// =======================================================

// CREAR PEDIDO
app.post('/api/pedidos', verificarToken, async (req, res) => {
  try {
    const { numeroOrden, nombreCliente, apellidoCliente, telefono, detalle, metodoEntrega } = req.body;
    const telefonoLimpio = telefono.replace(/\D/g, '');
    const nuevoPedido = await prisma.pedido.create({
      data: { tallerId: req.tallerId, numeroOrden, nombreCliente, apellidoCliente, telefono: telefonoLimpio, detalle, metodoEntrega, estado: 'pendiente' }
    });
    res.status(201).json(nuevoPedido);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el pedido' });
  }
});

// OBTENER PEDIDOS
app.get('/api/pedidos', verificarToken, async (req, res) => {
  try {
    const { estado, search, fecha } = req.query;
    let whereClause = { tallerId: req.tallerId };
    
    if (estado && estado !== 'todos') {
      whereClause.estado = estado;
    }

    if (fecha) {
      const [year, month, day] = fecha.split('-');
      const start = new Date(year, month - 1, day, 0, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      whereClause.fechaEntrada = { gte: start, lte: end };
    }

    let orderBy = {};
    if (estado === 'pendiente') {
      orderBy = { fechaEntrada: 'asc' };
    } else {
      orderBy = { fechaEntrada: 'desc' };
    }

    // Obtenemos los pedidos de la base de datos
    let pedidos = await prisma.pedido.findMany({ where: whereClause, orderBy });

    // Si hay búsqueda, filtramos a mano en Node.js para ignorar tildes perfectamente
    if (search) {
      const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const searchNorm = normalize(search);
      
      pedidos = pedidos.filter(p => 
        normalize(p.numeroOrden).includes(searchNorm) ||
        normalize(p.nombreCliente).includes(searchNorm) ||
        normalize(p.apellidoCliente).includes(searchNorm)
      );
    }

    res.json(pedidos);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Error al obtener los pedidos' });
  }
});

// EDITAR PEDIDO
app.put('/api/pedidos/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { numeroOrden, nombreCliente, apellidoCliente, telefono, detalle, metodoEntrega } = req.body;
    const telefonoLimpio = telefono.replace(/\D/g, '');
    const pedidoActualizado = await prisma.pedido.updateMany({
      where: { id: parseInt(id), tallerId: req.tallerId },
      data: { numeroOrden, nombreCliente, apellidoCliente, telefono: telefonoLimpio, detalle, metodoEntrega }
    });
    if (pedidoActualizado.count === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ message: 'Pedido actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al editar el pedido' });
  }
});

// FINALIZAR PEDIDO
app.patch('/api/pedidos/:id/finalizar', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const fechaEnvio = new Date(Date.now() + 3 * 60 * 1000);
    await prisma.pedido.updateMany({
      where: { id: parseInt(id), tallerId: req.tallerId },
      data: { estado: 'finalizado', notificacionProgramadaPara: fechaEnvio, notificacionEnviada: false }
    });
    res.json({ message: 'Pedido finalizado. Notificación programada.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al finalizar el pedido' });
  }
});

// REVERTIR PEDIDO
app.patch('/api/pedidos/:id/revertir', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.pedido.updateMany({
      where: { id: parseInt(id), tallerId: req.tallerId },
      data: { estado: 'pendiente', notificacionProgramadaPara: null, notificacionEnviada: false }
    });
    res.json({ message: 'Pedido revertido a pendiente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al revertir el pedido' });
  }
});

// ENVIAR YA
app.patch('/api/pedidos/:id/enviar-ya', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const fechaPasada = new Date(Date.now() - 60 * 1000);
    await prisma.pedido.updateMany({
      where: { id: parseInt(id), tallerId: req.tallerId },
      data: { notificacionProgramadaPara: fechaPasada }
    });
    res.json({ message: 'Notificación enviada inmediatamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al enviar la notificación' });
  }
});

// ELIMINAR PEDIDO
app.patch('/api/pedidos/:id/eliminar', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await prisma.pedido.findFirst({ where: { id: parseInt(id), tallerId: req.tallerId } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    await prisma.pedido.update({
      where: { id: parseInt(id) },
      data: { estado: 'eliminado', estadoAnterior: pedido.estado }
    });
    res.json({ message: 'Pedido movido a papelera' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el pedido' });
  }
});

// RESTAURAR PEDIDO
app.patch('/api/pedidos/:id/restaurar', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await prisma.pedido.findFirst({ where: { id: parseInt(id), tallerId: req.tallerId } });
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    await prisma.pedido.update({
      where: { id: parseInt(id) },
      data: { estado: pedido.estadoAnterior || 'pendiente', estadoAnterior: null }
    });
    res.json({ message: 'Pedido restaurado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al restaurar el pedido' });
  }
});
// OBTENER AJUSTES
app.get('/api/ajustes', verificarToken, async (req, res) => {
  try {
    const taller = await prisma.taller.findUnique({
      where: { id: req.tallerId },
      select: { nombre: true, metaToken: true, metaPhoneId: true, plantillaMensaje: true }
    });
    res.json(taller);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ajustes' });
  }
});

// GUARDAR AJUSTES
app.put('/api/ajustes', verificarToken, async (req, res) => {
  try {
    const { metaToken, metaPhoneId, plantillaMensaje } = req.body;
    await prisma.taller.update({
      where: { id: req.tallerId },
      data: { metaToken, metaPhoneId, plantillaMensaje }
    });
    res.json({ message: 'Ajustes guardados correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar ajustes' });
  }
});
// =======================================================
// RUTAS DE GMAIL (OAuth)
// =======================================================
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REDIRECT_URI
);

// 1. Iniciar conexión con Gmail
app.get('/api/gmail/auth', verificarToken, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'],
    state: req.tallerId.toString() // Le pasamos el ID del taller a Google para que nos lo devuelva
  });
  res.json({ url });
});

// 2. Google nos devuelve acá con el permiso
app.get('/api/gmail/callback', async (req, res) => {
  const code = req.query.code;
  const tallerId = parseInt(req.query.state);
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    await prisma.taller.update({
      where: { id: tallerId },
      data: {
        gmailAccessToken: tokens.access_token,
        gmailRefreshToken: tokens.refresh_token
      }
    });
    res.send('<script>window.close();</script><h1>Gmail conectado con éxito. Podés cerrar esta ventana.</h1>');
  } catch (error) {
    console.error('Error en callback de Gmail:', error);
    res.status(500).send('Error al conectar Gmail');
  }
});

// 3. Saber si ya está conectado
app.get('/api/gmail/status', verificarToken, async (req, res) => {
  const taller = await prisma.taller.findUnique({ where: { id: req.tallerId } });
  res.json({ connected: !!taller?.gmailAccessToken });
});
// MARCAR ARCHIVOS COMO IMPRESOS
app.patch('/api/pedidos/:id/marcar-impresos', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.pedido.updateMany({
      where: { id: parseInt(id), tallerId: req.tallerId },
      data: { archivosImpresos: true }
    });
    res.json({ message: 'Archivos marcados como impresos' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar' });
  }
});
// ELIMINAR PEDIDOS EN MASA
app.post('/api/pedidos/eliminar-masivo', verificarToken, async (req, res) => {
  try {
    const { ids } = req.body; // Recibimos un array de IDs ej: [1, 5, 8]
    
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'No se enviaron IDs válidos' });
    }

    // Recorremos cada ID, guardamos su estado actual y lo mandamos a la papelera
    for (const id of ids) {
      const pedido = await prisma.pedido.findFirst({ where: { id: parseInt(id), tallerId: req.tallerId } });
      if (pedido) {
        await prisma.pedido.update({
          where: { id: parseInt(id) },
          data: { estado: 'eliminado', estadoAnterior: pedido.estado }
        });
      }
    }
    
    res.json({ message: `${ids.length} pedido(s) movidos a la papelera` });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar en masa' });
  }
});
// CONTAR PEDIDOS
app.get('/api/pedidos/contar', verificarToken, async (req, res) => {
  try {
    const pendientes = await prisma.pedido.count({ where: { tallerId: req.tallerId, estado: 'pendiente' } });
    const pago_pendiente = await prisma.pedido.count({ where: { tallerId: req.tallerId, estado: 'pago_pendiente' } });
    const finalizados = await prisma.pedido.count({ where: { tallerId: req.tallerId, estado: 'finalizado' } });
    const eliminados = await prisma.pedido.count({ where: { tallerId: req.tallerId, estado: 'eliminado' } });

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const finalizadosHoy = await prisma.pedido.count({
      where: { tallerId: req.tallerId, estado: 'finalizado', fechaEntrada: { gte: hoy } }
    });

    const diaSemana = hoy.getDay();
    const diffLunes = hoy.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
    const lunes = new Date(hoy.setDate(diffLunes));
    lunes.setHours(0, 0, 0, 0);
    const finalizadosSemana = await prisma.pedido.count({
      where: { tallerId: req.tallerId, estado: 'finalizado', fechaEntrada: { gte: lunes } }
    });

    res.json({ pendientes, finalizados, eliminados, finalizadosSemana, finalizadosHoy, pago_pendiente });
  } catch (error) {
    res.status(500).json({ error: 'Error al contar los pedidos' });
  }
});

// =======================================================
// INICIAR SERVIDOR
// =======================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor de PrintFlow corriendo en http://localhost:${PORT}`);
});