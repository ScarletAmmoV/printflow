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
// CONTAR PEDIDOS
app.get('/api/pedidos/contar', verificarToken, async (req, res) => {
  try {
    const pendientes = await prisma.pedido.count({ where: { tallerId: req.tallerId, estado: 'pendiente' } });
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

    res.json({ pendientes, finalizados, eliminados, finalizadosSemana, finalizadosHoy });
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