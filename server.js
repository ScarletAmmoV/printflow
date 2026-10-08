require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { Resend } = require('resend');


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
// Configuración Cloudinary
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
// Configuración Resend (Para mandar mails)
const resend = new Resend(process.env.RESEND_API_KEY);

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

       // Buscamos y subimos los archivos adjuntos a Cloudinary
        if (email.data.payload.parts) {
          for (const part of email.data.payload.parts) {
            if (part.filename && part.filename.length > 0) {
              // Obtenemos el archivo de Gmail
              const attachment = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: msg.id,
                id: part.body.attachmentId
              });
              
              // Gmail nos lo da en Base64. Lo convertimos en un Buffer (archivo real)
              const buffer = Buffer.from(attachment.data.data, 'base64');
              
              // Lo subimos a Cloudinary
              const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                  { folder: 'kova_solutions', resource_type: 'auto' },
                  (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                  }
                );
                uploadStream.end(buffer);
              });
              
              // Guardamos la URL pública que nos devolvió Cloudinary
              attachments.push(result.secure_url);
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
// EL REVISOR DE TIENDA NUBE (Worker)
// =======================================================
setInterval(async () => {
  try {
    // Buscamos todos los talleres que tengan Tienda Nube conectado
    const talleres = await prisma.taller.findMany({
      where: { tiendanubeToken: { not: null }, tiendanubeStoreId: { not: null } }
    });

    for (const taller of talleres) {
      try {
        // Le pedimos a Tienda Nube los últimos 5 pedidos
        const response = await fetch(`https://api.tiendanube.com/v1/${taller.tiendanubeStoreId}/orders?per_page=5`, {
          headers: {
            'Authentication': `bearer ${taller.tiendanubeToken}`,
            'User-Agent': 'Kova Solutions (gwillimanyt@gmail.com)' // Tienda Nube exige un User-Agent
          }
        });

        if (!response.ok) continue;
        const orders = await response.json();

        for (const order of orders) {
          // Nos fijamos si ya tenemos este pedido en Kova (usamos el ID de Tienda Nube como número de orden)
          const existe = await prisma.pedido.findFirst({
            where: { tallerId: taller.id, numeroOrden: String(order.id) }
          });

          // Si no existe, lo creamos
          if (!existe) {
            let detalleProductos = order.products.map(p => `${p.name} x${p.quantity}`).join(', ');
            let nombreCompleto = order.customer_name ? order.customer_name.split(' ') : ['Cliente', 'TiendaNube'];
            
            await prisma.pedido.create({
              data: {
                tallerId: taller.id,
                numeroOrden: String(order.id),
                nombreCliente: nombreCompleto[0] || 'Cliente',
                apellidoCliente: nombreCompleto.slice(1).join(' ') || '',
                emailCliente: order.customer_email || null,
                telefono: (order.customer_phone || order.billing_phone || '0000000000').replace(/\D/g, ''),
                detalle: detalleProductos || 'Pedido online',
                metodoEntrega: order.shipping_option ? 'envio' : 'retiro',
                precioTotal: parseFloat(order.total) || 0,
                estado: 'pendiente'
              }
            });
            console.log(`[Tienda Nube] Pedido #${order.id} importado para ${taller.nombre}`);
          }
        }
      } catch (err) {
        console.error(`Error leyendo Tienda Nube para taller ${taller.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Error en el revisor de Tienda Nube:', error);
  }
}, 30000); // 30000 milisegundos = 30 segundos
// =======================================================
// RUTAS DE AUTENTICACIÓN
// =======================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, usuario, email, password } = req.body; // Agregamos email
    if (!nombre || !usuario || !email || !password) return res.status(400).json({ error: 'Todos los campos son obligatorios' }); // Agregamos validación

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const nuevoTaller = await prisma.taller.create({
      data: { nombre, usuario, email, password: hashedPassword } // Agregamos email
    });

    res.status(201).json({ message: 'Taller registrado correctamente', tallerId: nuevoTaller.id });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'El usuario o email ya está en uso' });
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
// OLVIDÉ MI CONTRASEÑA
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const taller = await prisma.taller.findUnique({ where: { email } });

    // Por seguridad, si el mail no existe, igual decimos que se envió (para que no sepan qué mails están registrados)
    if (!taller) return res.status(200).json({ message: 'Si el correo existe, te enviamos un link.' });

    // Generamos un token único que expira en 1 hora
    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await prisma.taller.update({
      where: { id: taller.id },
      data: { resetPasswordToken: token, resetPasswordExpires: expires }
    });

    // Acordate de cambiar esto por tu URL real de Vercel
    const resetUrl = `https://printflow-phi-virid.vercel.app/#/reset-password?token=${token}`;

    await resend.emails.send({
      from: 'Kova Solutions <onboarding@resend.dev>',
      to: taller.email,
      subject: 'Recuperación de Contraseña - Kova Solutions',
      html: `<h3>Hola ${taller.nombre}</h3>
             <p>Recibimos una solicitud para restablecer tu contraseña.</p>
             <p>Hacé clic en el siguiente enlace para crear una nueva (expira en 1 hora):</p>
             <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>`
    });

    res.status(200).json({ message: 'Si el correo existe, te enviamos un link.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al enviar el mail' });
  }
});

// RESETEAR CONTRASEÑA
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    const taller = await prisma.taller.findFirst({
      where: { 
        resetPasswordToken: token,
        resetPasswordExpires: { gt: new Date() } // Que no haya expirado
      }
    });

    if (!taller) return res.status(400).json({ error: 'El token es inválido o ha expirado.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await prisma.taller.update({
      where: { id: taller.id },
      data: { 
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    res.status(200).json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la contraseña' });
  }
});

// =======================================================
// RUTAS DE PEDIDOS
// =======================================================

// CREAR PEDIDO
app.post('/api/pedidos', verificarToken, async (req, res) => {
  try {
    const { numeroOrden, nombreCliente, apellidoCliente, emailCliente, dni, telefono, detalle, metodoEntrega, precioTotal } = req.body;
    const telefonoLimpio = telefono.replace(/\D/g, '');
    const nuevoPedido = await prisma.pedido.create({
      data: {
        tallerId: req.tallerId,
        numeroOrden,
        nombreCliente,
        apellidoCliente,
        emailCliente: emailCliente || null,
        dni: dni || null, // Si viene vacío, lo guarda como null
        telefono: telefonoLimpio,
        detalle,
        metodoEntrega,
        precioTotal: parseFloat(precioTotal) || 0, // Si viene vacío, lo guarda como 0
        estado: 'pendiente'
      }
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
    const { numeroOrden, nombreCliente, apellidoCliente, emailCliente, dni, telefono, detalle, metodoEntrega, precioTotal } = req.body;
    const telefonoLimpio = telefono.replace(/\D/g, '');
    const pedidoActualizado = await prisma.pedido.updateMany({
      where: { id: parseInt(id), tallerId: req.tallerId },
      data: { 
        numeroOrden, 
        nombreCliente, 
        apellidoCliente, 
        emailCliente: emailCliente || null, 
        dni: dni || null,
        telefono: telefonoLimpio, 
        detalle, 
        metodoEntrega,
        precioTotal: parseFloat(precioTotal) || 0
      }
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
      select: { 
        nombre: true, 
        metaToken: true, 
        metaPhoneId: true, 
        plantillaMensaje: true,
        pinMetricas: true,
        tiendanubeToken: true, // NUEVO
        tiendanubeStoreId: true // NUEVO
      }
    });
    res.json(taller);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener ajustes' });
  }
});

// GUARDAR AJUSTES
app.put('/api/ajustes', verificarToken, async (req, res) => {
  try {
    const { metaToken, metaPhoneId, plantillaMensaje, tiendanubeToken, tiendanubeStoreId } = req.body;
    await prisma.taller.update({
      where: { id: req.tallerId },
      data: { 
        metaToken, 
        metaPhoneId, 
        plantillaMensaje,
        tiendanubeToken,
        tiendanubeStoreId: parseInt(tiendanubeStoreId) || null // NUEVO
      }
    });
    res.json({ message: 'Ajustes guardados correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar ajustes' });
  }
});


// GUARDAR PIN DE MÉTRICAS
app.put('/api/ajustes/pin', verificarToken, async (req, res) => {
  try {
    const { pin } = req.body;
    // Si el pin viene vacío, lo guardamos como null (para desactivarlo)
    await prisma.taller.update({
      where: { id: req.tallerId },
      data: { pinMetricas: pin || null }
    });
    res.json({ message: 'PIN actualizado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar el PIN' });
  }
});

// VERIFICAR PIN DE MÉTRICAS
app.post('/api/ajustes/verificar-pin', verificarToken, async (req, res) => {
  try {
    const { pin } = req.body;
    const taller = await prisma.taller.findUnique({ where: { id: req.tallerId } });
    
    if (!taller.pinMetricas) return res.json({ success: true });
    if (taller.pinMetricas === pin) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'PIN incorrecto' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar el PIN' });
  }
});

// DESACTIVAR PIN (Pidiendo el PIN actual)
app.post('/api/ajustes/desactivar-pin', verificarToken, async (req, res) => {
  try {
    const { pin } = req.body;
    const taller = await prisma.taller.findUnique({ where: { id: req.tallerId } });

    if (!taller.pinMetricas) return res.json({ success: true, message: 'No había PIN configurado' });
    
    if (taller.pinMetricas === pin) {
      await prisma.taller.update({
        where: { id: req.tallerId },
        data: { pinMetricas: null }
      });
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'PIN incorrecto' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar el PIN' });
  }
});

// RESTABLECER PIN OLVIDADO (Pidiendo contraseña de la cuenta)
app.post('/api/ajustes/reset-pin', verificarToken, async (req, res) => {
  try {
    const { password } = req.body;
    const taller = await prisma.taller.findUnique({ where: { id: req.tallerId } });

    const passwordValido = await bcrypt.compare(password, taller.password);
    if (!passwordValido) return res.status(400).json({ error: 'Contraseña incorrecta' });

    await prisma.taller.update({
      where: { id: req.tallerId },
      data: { pinMetricas: null }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al restablecer el PIN' });
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
    state: req.tallerId.toString(),
    prompt: 'consent' // Obliga a Google a darnos un nuevo Refresh Token siempre
  });
  res.json({ url });
});

// 2. Google nos devuelve acá con el permiso
app.get('/api/gmail/callback', async (req, res) => {
  const code = req.query.code;
  const tallerId = parseInt(req.query.state);
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Preparamos los datos a guardar. Siempre guardamos el Access Token.
    const dataToUpdate = { gmailAccessToken: tokens.access_token };
    
    // Si Google nos mandó un Refresh Token nuevo, lo guardamos. Si no, dejamos el que ya teníamos.
    if (tokens.refresh_token) {
      dataToUpdate.gmailRefreshToken = tokens.refresh_token;
    }

    await prisma.taller.update({
      where: { id: tallerId },
      data: dataToUpdate
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
// 4. Desconectar Gmail
app.delete('/api/gmail/disconnect', verificarToken, async (req, res) => {
  try {
    await prisma.taller.update({
      where: { id: req.tallerId },
      data: {
        gmailAccessToken: null,
        gmailRefreshToken: null
      }
    });
    res.json({ message: 'Gmail desconectado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

// WEBHOOKS DE PRIVACIDAD DE TIENDA NUBE (Obligatorios)
app.post('/api/tiendanube/store-redact', (req, res) => res.sendStatus(200));
app.post('/api/tiendanube/customers-redact', (req, res) => res.sendStatus(200));
app.post('/api/tiendanube/customers-data-request', (req, res) => res.sendStatus(200));




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
// OBTENER MÉTRICAS FINANCIERAS
app.get('/api/pedidos/metricas', verificarToken, async (req, res) => {
  try {
    // Buscamos todos los pedidos que no estén eliminados
    const pedidos = await prisma.pedido.findMany({
      where: { tallerId: req.tallerId, estado: { not: 'eliminado' } }
    });

    const totalPedidos = pedidos.length;
    const totalIngresos = pedidos.reduce((sum, p) => sum + (p.precioTotal || 0), 0);
    const ticketPromedio = totalPedidos > 0 ? totalIngresos / totalPedidos : 0;

    // Contamos clientes únicos por teléfono
    const telefonosUnicos = new Set(pedidos.map(p => p.telefono));
    const totalClientes = telefonosUnicos.size;

    res.json({
      totalPedidos,
      totalIngresos: totalIngresos.toFixed(2),
      ticketPromedio: ticketPromedio.toFixed(2),
      totalClientes
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});
// MÉTRICAS AVANZADAS (Productos y Edades)
app.get('/api/pedidos/metricas-avanzadas', verificarToken, async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: { tallerId: req.tallerId, estado: { not: 'eliminado' } }
    });

    // 1. PRODUCTOS CALIENTES
    const conteoProductos = {};
    pedidos.forEach(p => {
      if (!p.detalle) return;
      
      // Separamos por saltos de línea o comas, por si hay múltiples productos en un pedido
      const lineas = p.detalle.split(/[\n,]+/);
      
      lineas.forEach(linea => {
        const lineaLimpia = linea.trim();
        if (!lineaLimpia) return;

        // Buscamos si tiene un "x" seguido de un número (ej: "x2", "x100")
        const match = lineaLimpia.match(/x\s*(\d+)/i);
        let cantidad = 1;
        let nombreProducto = lineaLimpia;

        if (match) {
          cantidad = parseInt(match[1], 10);
          // Sacamos el "x2" del nombre del producto para que quede limpio
          nombreProducto = lineaLimpia.replace(/x\s*\d+/i, '').trim();
        }

        // Sumamos la cantidad
        if (conteoProductos[nombreProducto]) {
          conteoProductos[nombreProducto] += cantidad;
        } else {
          conteoProductos[nombreProducto] = cantidad;
        }
      });
    });

    // Convertimos a un array y ordenamos de mayor a menor
    const productosCalientes = Object.entries(conteoProductos)
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5); // Top 5

    // 2. EDAD POR DNI (Agrupación simple)
    // Nota: Es una aproximación basada en los millones del DNI (ej: 20M-30M)
    const rangos = { '18-25': 0, '26-35': 0, '36-50': 0, '50+': 0, 'Sin DNI': 0 };

    pedidos.forEach(p => {
      if (!p.dni) {
        rangos['Sin DNI']++;
        return;
      }
      const numDni = parseInt(p.dni.replace(/\D/g, ''), 10);
      if (isNaN(numDni)) return;

      // Aproximación para Argentina (ej: >40M son los más jóvenes)
      if (numDni > 40000000) rangos['18-25']++;
      else if (numDni > 30000000) rangos['26-35']++;
      else if (numDni > 20000000) rangos['36-50']++;
      else rangos['50+']++;
    });

    res.json({ productosCalientes, rangosEdad: rangos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener métricas avanzadas' });
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