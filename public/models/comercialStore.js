// MODELO · Store local de COMERCIAL.
// Rescata capacidades operativas del frente legacy dentro del repo nuevo:
// relaciones entre cliente, oportunidad, agenda, contrato, cotizacion y cobranza.

const KEY = "reciclean.comercial.store.v1";

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stageOrder(stage) {
  const order = {
    Lead: 1,
    Calificado: 2,
    Cotizado: 3,
    Negociando: 4,
    Ganado: 5,
    Perdido: 6,
    "En pausa": 7,
  };
  return order[stage] || 99;
}

function buildSeed() {
  const created = nowIso();
  return {
    currentUser: "Andrea",
    clients: [
      {
        id: "cli-001",
        nombre: "Supermercados Andinos",
        rut: "76.218.445-1",
        plaza: "Santiago",
        sucursal: "Cerrillos",
        segmento: "Activo",
        color: "Verde",
        score: 91,
        ejecutivo: "Andrea",
        contacto: "Andrea Lagos",
        telefono: "+56 9 6765 1102",
        email: "compras@andinos.cl",
        direccion: "Camino Melipilla 14320, Cerrillos",
        materiales: ["Carton OCC", "Stretch film"],
        formaPago: "Transferencia a 30 dias",
        condicionesPago: "Pago contra factura",
        categoria: "A",
        proximaAccion: "Cerrar cobranza y confirmar contenedor adicional.",
        customFields: [
          { label: "Tipo de relacion", value: "Compra con pago contra factura" },
          { label: "Frecuencia servicio", value: "Semanal" },
          { label: "Sucursal legacy", value: "Cerrillos" },
          { label: "Cuenta bancaria", value: "Transferencia empresa" },
          { label: "Segmento interno", value: "Retail prioritario" },
        ],
        comentario: "Cliente estable y rentable. La tension actual no es comercial sino de capacidad: si no se ordena la cobranza y el contenedor adicional, se puede contaminar una cuenta que viene funcionando bien.",
        timeline: [
          { id: uid("ctl"), at: created, tipo: "Cobranza", detalle: "Cliente confirma pago parcial para el viernes." },
          { id: uid("ctl"), at: created, tipo: "Operacion", detalle: "Se detecta saturacion de contenedor antes de lo previsto." },
        ],
        saneamiento: ["Revisar razon social en ERP por doble alias comercial"],
        expedientes: [
          { id: "exp-001", titulo: "Retiro julio OCC", estado: "pendiente_pago", kilos: "8.2 ton", fecha: "2026-07-18", comprobantes: ["comp_pago_18jul.pdf"] },
        ],
      },
      {
        id: "cli-002",
        nombre: "Frigorifico Talca Sur",
        rut: "77.019.552-6",
        plaza: "Talca",
        sucursal: "Talca",
        segmento: "Caliente",
        color: "Ambar",
        score: 88,
        ejecutivo: "Andrea",
        contacto: "Roman Mena",
        telefono: "+56 9 5512 4488",
        email: "operaciones@talcasur.cl",
        direccion: "Ruta 5 Sur km 247, Talca",
        materiales: ["PEAD", "Chatarra liviana"],
        formaPago: "Transferencia",
        condicionesPago: "15 dias",
        categoria: "B",
        proximaAccion: "Cerrar frecuencia y bajar salida piloto a ruta Talca.",
        customFields: [
          { label: "Tipo de relacion", value: "Retiro valorizable piloto" },
          { label: "Frecuencia propuesta", value: "Semanal vs quincenal" },
          { label: "Planta asociada", value: "Talca" },
          { label: "Condicion comercial", value: "Esperando definicion operativa" },
          { label: "Responsable legado", value: "Andrea Rivera" },
        ],
        comentario: "Es una cuenta que puede crecer, pero depende de una definicion simple que hoy sigue trabando todo: frecuencia, ruta y responsable de bajada.",
        timeline: [
          { id: uid("ctl"), at: created, tipo: "Seguimiento", detalle: "Cliente pide propuesta semanal vs quincenal." },
        ],
        saneamiento: ["Completar correo alternativo"],
        expedientes: [],
      },
      {
        id: "cli-003",
        nombre: "Retail Puerto Verde",
        rut: "76.887.320-3",
        plaza: "Puerto Montt",
        sucursal: "Puerto Montt",
        segmento: "Activo",
        color: "Verde",
        score: 93,
        ejecutivo: "Andrea",
        contacto: "Monica Vera",
        telefono: "+56 9 7142 2021",
        email: "sostenibilidad@puertoverde.cl",
        direccion: "Parque Industrial Cardonal 880, Puerto Montt",
        materiales: ["Carton", "PET", "Stretch film"],
        formaPago: "Transferencia 30 dias",
        condicionesPago: "Pago al dia 30",
        categoria: "A",
        proximaAccion: "Empujar ampliacion de contrato por volumen.",
        customFields: [
          { label: "Tipo de relacion", value: "Contrato recurrente mixto" },
          { label: "Frecuencia servicio", value: "Quincenal" },
          { label: "Zona de retiro", value: "Parque Industrial Cardonal" },
          { label: "Estado comercial", value: "Cliente activo con expansion" },
          { label: "Certificacion", value: "Pendiente de renovar" },
        ],
        comentario: "Cliente con muy buena disposicion para ampliar volumen. La clave es no venderle solo precio: hay que mostrarle continuidad y orden operacional.",
        timeline: [
          { id: uid("ctl"), at: created, tipo: "Negociacion", detalle: "Cliente abierto a sumar un segundo retiro mensual." },
        ],
        saneamiento: [],
        expedientes: [],
      },
      {
        id: "cli-004",
        nombre: "Constructora Maipu Norte",
        rut: "77.441.908-9",
        plaza: "Santiago",
        sucursal: "Maipu",
        segmento: "Tibio",
        color: "Rojo",
        score: 63,
        ejecutivo: "Andrea",
        contacto: "Claudio Orellana",
        telefono: "+56 9 6421 6610",
        email: "bodega@maipunorte.cl",
        direccion: "Av. Pajaritos 8120, Maipu",
        materiales: ["Metales ferrosos"],
        formaPago: "Pendiente",
        condicionesPago: "Sin definir",
        categoria: "C",
        proximaAccion: "Mover cotizacion a respuesta concreta.",
        customFields: [
          { label: "Tipo de relacion", value: "Cotizacion abierta" },
          { label: "Material dominante", value: "Metales ferrosos" },
          { label: "Planta sugerida", value: "Santiago" },
          { label: "Bloqueo principal", value: "Razon social inconsistente" },
          { label: "Estado administrativo", value: "Sin condiciones cerradas" },
        ],
        comentario: "Cuenta todavia verde. Antes de seguir empujando comercialmente conviene sanear identidad y validar si el volumen real sostiene el esfuerzo.",
        timeline: [
          { id: uid("ctl"), at: created, tipo: "Cotizacion", detalle: "Se envia propuesta de retiro de metales." },
        ],
        saneamiento: ["Validar razon social", "Cruzar con cliente legacy de Maipu Norte Ltda."],
        expedientes: [],
      },
      {
        id: "cli-005",
        nombre: "Agroindustrial Los Robles",
        rut: "76.998.120-7",
        plaza: "Puerto Montt",
        sucursal: "Los Muermos",
        segmento: "Tibio",
        color: "Ambar",
        score: 57,
        ejecutivo: "Andrea",
        contacto: "Pamela Soto",
        telefono: "+56 9 5011 8843",
        email: "operaciones@losrobles.cl",
        direccion: "Ruta V-505 km 6, Los Muermos",
        materiales: ["Plastico agricola"],
        formaPago: "Pendiente",
        condicionesPago: "Sin definir",
        categoria: "C",
        proximaAccion: "Reactivar en agosto y devolver a cotizacion.",
        customFields: [
          { label: "Tipo de relacion", value: "Prospecto pausado" },
          { label: "Ventana de reactivacion", value: "Agosto 2026" },
          { label: "Material dominante", value: "Plastico agricola" },
          { label: "Condicion actual", value: "Cliente pide retomar mas adelante" },
          { label: "Riesgo", value: "Perder momentum comercial" },
        ],
        comentario: "No es una cuenta muerta, pero si se deja enfriar demasiado va a volver a cero. La reactivacion tiene que caer con fecha y propuesta concreta.",
        timeline: [
          { id: uid("ctl"), at: created, tipo: "Pausa", detalle: "Cliente pide retomar conversacion en agosto." },
        ],
        saneamiento: ["Completar contacto alternativo", "Normalizar nombre de sucursal"],
        expedientes: [],
      },
    ],
    opportunities: [
      {
        id: "op-001",
        clientId: "cli-001",
        titulo: "Supermercados Andinos · retiro film mensual",
        etapa: "Ganado",
        material: "Stretch film",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Alta",
        probabilidad: 100,
        monto: 7900000,
        vencimiento: "2026-07-24",
        descripcion: "Negociacion cerrada. Debe bajar a agenda o contrato.",
        siguiente: "Elegir entre Agendar ahora, Diferir agenda o Crear contrato.",
        owner: "Andrea",
        comentarios: [
          { id: uid("opc"), autor: "Andrea", at: created, texto: "Caso cerrado. No debe quedar durmiendo en Ganado." },
        ],
        archivos: [{ id: uid("opf"), nombre: "propuesta-film-julio.pdf", size: "182 KB", at: created }],
        seguimiento: [
          { id: uid("ops"), at: created, evento: "Creada en Negociando y luego movida a Ganado" },
        ],
        checklist: ["Crear salida inicial", "Confirmar frecuencia", "Formalizar acuerdo"],
      },
      {
        id: "op-002",
        clientId: "cli-002",
        titulo: "Frigorifico Talca Sur · retiro PEAD",
        etapa: "Calificado",
        material: "PEAD",
        ejecutivo: "Andrea",
        sucursal: "Talca",
        prioridad: "Alta",
        probabilidad: 58,
        monto: 3200000,
        vencimiento: "2026-07-28",
        descripcion: "Caso viable con material y frecuencia posibles. Falta decidir semanal o quincenal.",
        siguiente: "Cerrar condicion de ruta y bajar salida piloto.",
        owner: "",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Se valida patio y flujo de descarga." }],
        checklist: ["Cerrar frecuencia", "Definir chofer", "Acordar precio base"],
      },
      {
        id: "op-003",
        clientId: "cli-003",
        titulo: "Retail Puerto Verde · retiro mixto",
        etapa: "Negociando",
        material: "Carton + PET",
        ejecutivo: "Andrea",
        sucursal: "Puerto Montt",
        prioridad: "Alta",
        probabilidad: 79,
        monto: 9400000,
        vencimiento: "2026-07-25",
        descripcion: "Cliente con interes real. Esta ajustando precio pactado y frecuencia de retiro.",
        siguiente: "Definir contraoferta y convertir en contrato recurrente.",
        owner: "Andrea",
        comentarios: [{ id: uid("opc"), autor: "Andrea", at: created, texto: "Esperando respuesta final sobre frecuencia." }],
        archivos: [{ id: uid("opf"), nombre: "contraoferta-retail-pverde.xlsx", size: "94 KB", at: created }],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Se abre contraoferta." }],
        checklist: ["Cerrar precio", "Validar frecuencia", "Preparar borrador de contrato"],
      },
      {
        id: "op-004",
        clientId: "cli-004",
        titulo: "Constructora Maipu Norte · retiro metales",
        etapa: "Cotizado",
        material: "Metales ferrosos",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Media",
        probabilidad: 47,
        monto: 5100000,
        vencimiento: "2026-07-30",
        descripcion: "Cotizacion enviada; cliente pidio detalle de contenedor y frecuencia.",
        siguiente: "Cerrar respuesta comercial y mover a Negociando o descartar.",
        owner: "",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Cotizacion enviada." }],
        checklist: ["Responder dudas", "Ajustar contenedor", "Fijar fecha de decision"],
      },
      {
        id: "op-005",
        clientId: "cli-005",
        titulo: "Agroindustrial Los Robles · retiro plastico",
        etapa: "En pausa",
        material: "Plastico agricola",
        ejecutivo: "Andrea",
        sucursal: "Puerto Montt",
        prioridad: "Media",
        probabilidad: 31,
        monto: 2700000,
        vencimiento: "2026-08-05",
        descripcion: "Cliente pidio postergar la decision hasta agosto.",
        siguiente: "Reactivar el 05 de agosto y devolver a Cotizado.",
        owner: "",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Caso pausado por solicitud del cliente." }],
        checklist: ["Programar follow-up", "Revisar nueva frecuencia", "Recapturar necesidad"],
      },
      {
        id: "op-006",
        clientId: "cli-004",
        titulo: "Constructora Maipu Norte · retiro estructural mixto",
        etapa: "Lead",
        material: "Metales + madera",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Media",
        probabilidad: 22,
        monto: 4100000,
        vencimiento: "2026-07-29",
        descripcion: "Ingreso inicial desde patio de obra. Aun falta validar volumen real.",
        siguiente: "Llamar a encargado de bodega y medir frecuencia de retiro.",
        owner: "",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Lead abierto desde cartera de Maipu." }],
        checklist: ["Validar volumen", "Tomar contacto", "Definir oportunidad real"],
      },
      {
        id: "op-007",
        clientId: "cli-002",
        titulo: "Frigorifico Talca Sur · cartones area despacho",
        etapa: "Lead",
        material: "Carton OCC",
        ejecutivo: "Andrea",
        sucursal: "Talca",
        prioridad: "Alta",
        probabilidad: 29,
        monto: 2600000,
        vencimiento: "2026-07-27",
        descripcion: "Nuevo frente detectado dentro del mismo cliente actual.",
        siguiente: "Cruzar si se puede anexar a la misma ruta piloto.",
        owner: "Andrea",
        comentarios: [{ id: uid("opc"), autor: "Andrea", at: created, texto: "Puede entrar por aprovechamiento de viaje." }],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Se detecta nueva linea valorizable." }],
        checklist: ["Confirmar volumen", "Revisar ruta", "Preparar mini propuesta"],
      },
      {
        id: "op-008",
        clientId: "cli-003",
        titulo: "Retail Puerto Verde · retiro tienda satelite",
        etapa: "Lead",
        material: "Carton + nylon",
        ejecutivo: "Andrea",
        sucursal: "Puerto Montt",
        prioridad: "Media",
        probabilidad: 18,
        monto: 1950000,
        vencimiento: "2026-08-01",
        descripcion: "Expansión a sucursal satelite todavia sin validación logística.",
        siguiente: "Levantar direccion exacta y ventana horaria.",
        owner: "",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Cliente comenta interes por segunda ubicacion." }],
        checklist: ["Levantar direccion", "Confirmar encargado", "Estimar kilos"],
      },
      {
        id: "op-009",
        clientId: "cli-001",
        titulo: "Supermercados Andinos · carton patio trasero",
        etapa: "Calificado",
        material: "Carton OCC",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Alta",
        probabilidad: 63,
        monto: 4600000,
        vencimiento: "2026-07-26",
        descripcion: "Ya hay volumen confirmado y punto de carga definido.",
        siguiente: "Bajar cotizacion con frecuencia semanal.",
        owner: "Andrea",
        comentarios: [{ id: uid("opc"), autor: "Andrea", at: created, texto: "Cliente quiere una propuesta corta y operativa." }],
        archivos: [{ id: uid("opf"), nombre: "fotos-patio-andinos.zip", size: "12 MB", at: created }],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Calificado con visita y fotos." }],
        checklist: ["Cotizar", "Validar horario", "Definir contenedor"],
      },
      {
        id: "op-010",
        clientId: "cli-005",
        titulo: "Agroindustrial Los Robles · bins de plastico lavado",
        etapa: "Calificado",
        material: "PEAD lavado",
        ejecutivo: "Andrea",
        sucursal: "Puerto Montt",
        prioridad: "Media",
        probabilidad: 52,
        monto: 3500000,
        vencimiento: "2026-07-31",
        descripcion: "Material atractivo, pero aun con dudas en la frecuencia.",
        siguiente: "Aterrizar retiro quincenal y responsable local.",
        owner: "",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Cliente confirma disponibilidad del material." }],
        checklist: ["Definir frecuencia", "Validar responsable", "Cerrar volumen mensual"],
      },
      {
        id: "op-011",
        clientId: "cli-003",
        titulo: "Retail Puerto Verde · film bodega norte",
        etapa: "Calificado",
        material: "Stretch film",
        ejecutivo: "Andrea",
        sucursal: "Puerto Montt",
        prioridad: "Alta",
        probabilidad: 61,
        monto: 4300000,
        vencimiento: "2026-07-27",
        descripcion: "Caso listo para bajar a propuesta economica.",
        siguiente: "Enviar estructura de retiro con frecuencia y caja consolidada.",
        owner: "Andrea",
        comentarios: [],
        archivos: [{ id: uid("opf"), nombre: "inventario-film-julio.xlsx", size: "88 KB", at: created }],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Lead convertido a calificado." }],
        checklist: ["Enviar propuesta", "Definir ventana", "Validar volumen base"],
      },
      {
        id: "op-012",
        clientId: "cli-001",
        titulo: "Supermercados Andinos · pallets fuera de uso",
        etapa: "Cotizado",
        material: "Madera",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Media",
        probabilidad: 41,
        monto: 2400000,
        vencimiento: "2026-07-29",
        descripcion: "Cotizacion enviada como servicio anexo al retiro film.",
        siguiente: "Presionar respuesta y evaluar combo con ruta actual.",
        owner: "Andrea",
        comentarios: [],
        archivos: [{ id: uid("opf"), nombre: "cotizacion-pallets.pdf", size: "176 KB", at: created }],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Se envia propuesta complementaria." }],
        checklist: ["Llamar decision maker", "Ajustar retiro", "Mover a negociacion si confirma"],
      },
      {
        id: "op-013",
        clientId: "cli-002",
        titulo: "Frigorifico Talca Sur · retiro mixto patio 2",
        etapa: "Cotizado",
        material: "PEAD + carton",
        ejecutivo: "Andrea",
        sucursal: "Talca",
        prioridad: "Alta",
        probabilidad: 54,
        monto: 4800000,
        vencimiento: "2026-07-28",
        descripcion: "Cliente pidio separar propuesta por flujo operativo.",
        siguiente: "Ajustar propuesta y pasar a negociacion.",
        owner: "Andrea",
        comentarios: [{ id: uid("opc"), autor: "Andrea", at: created, texto: "Buena opcion para consolidar Talca." }],
        archivos: [{ id: uid("opf"), nombre: "cotizacion-talca-mixta.xlsx", size: "122 KB", at: created }],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Se envia cotizacion corregida." }],
        checklist: ["Separar lineas", "Reconfirmar ruta", "Cerrar decision"],
      },
      {
        id: "op-014",
        clientId: "cli-004",
        titulo: "Constructora Maipu Norte · retiro malla y fierro",
        etapa: "Negociando",
        material: "Fierro + malla",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Alta",
        probabilidad: 72,
        monto: 6100000,
        vencimiento: "2026-07-26",
        descripcion: "Cliente esta entre cerrar mensual o retiro por obra.",
        siguiente: "Cerrar modalidad y aterrizar punto de acopio.",
        owner: "Andrea",
        comentarios: [{ id: uid("opc"), autor: "Andrea", at: created, texto: "Hay que evitar que se enfrie antes del viernes." }],
        archivos: [{ id: uid("opf"), nombre: "malla-fierro-maipu.pdf", size: "205 KB", at: created }],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Entra en ronda final de negociación." }],
        checklist: ["Cerrar modalidad", "Definir contenedor", "Preparar acuerdo"],
      },
      {
        id: "op-015",
        clientId: "cli-002",
        titulo: "Frigorifico Talca Sur · bins de alto volumen",
        etapa: "Negociando",
        material: "Bins PEAD",
        ejecutivo: "Andrea",
        sucursal: "Talca",
        prioridad: "Media",
        probabilidad: 68,
        monto: 5600000,
        vencimiento: "2026-07-30",
        descripcion: "Caso con buen margen, esperando definicion del encargado de planta.",
        siguiente: "Cerrar llamada con gerente de patio y propuesta final.",
        owner: "",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Se estanca por firma interna del cliente." }],
        checklist: ["Agendar llamada", "Cerrar volumen", "Dejar salida lista"],
      },
      {
        id: "op-016",
        clientId: "cli-003",
        titulo: "Retail Puerto Verde · ampliacion de contrato base",
        etapa: "Ganado",
        material: "Carton + PET",
        ejecutivo: "Andrea",
        sucursal: "Puerto Montt",
        prioridad: "Alta",
        probabilidad: 100,
        monto: 11800000,
        vencimiento: "2026-07-23",
        descripcion: "Aprobada ampliacion del volumen mensual. Requiere ejecucion inmediata.",
        siguiente: "Crear contrato complementario y gatillar agenda.",
        owner: "Andrea",
        comentarios: [{ id: uid("opc"), autor: "Andrea", at: created, texto: "Caso ganado y listo para bajar al siguiente tramo." }],
        archivos: [{ id: uid("opf"), nombre: "ok-ampliacion-puerto-verde.msg", size: "64 KB", at: created }],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Cliente aprueba ampliacion." }],
        checklist: ["Crear contrato", "Agendar primer retiro", "Notificar a operaciones"],
      },
      {
        id: "op-017",
        clientId: "cli-004",
        titulo: "Constructora Maipu Norte · retiro de descarte fino",
        etapa: "Perdido",
        material: "Chatarra liviana",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Baja",
        probabilidad: 0,
        monto: 1800000,
        vencimiento: "2026-07-18",
        descripcion: "Cliente decidió resolver internamente el retiro menor.",
        siguiente: "Mantener en histórico y reabrir si vuelve volumen.",
        owner: "",
        comentarios: [{ id: uid("opc"), autor: "Andrea", at: created, texto: "No conviene seguir empujando ahora." }],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Caso cerrado como perdido." }],
        checklist: ["Registrar motivo", "Mantener contacto", "Revisar en 60 dias"],
      },
      {
        id: "op-018",
        clientId: "cli-001",
        titulo: "Supermercados Andinos · plastico compactado sucursal 2",
        etapa: "En pausa",
        material: "Plastico mixto",
        ejecutivo: "Andrea",
        sucursal: "Santiago",
        prioridad: "Media",
        probabilidad: 34,
        monto: 2200000,
        vencimiento: "2026-08-08",
        descripcion: "Proyecto detenido por remodelacion interna del patio.",
        siguiente: "Retomar cuando el cliente confirme reapertura de zona de carga.",
        owner: "Andrea",
        comentarios: [],
        archivos: [],
        seguimiento: [{ id: uid("ops"), at: created, evento: "Cliente pausa por obras internas." }],
        checklist: ["Agendar recordatorio", "Revisar fotos nuevas", "Reactivar con nueva fecha"],
      },
    ],
    routes: [
      {
        id: "ruta-stgo",
        nombre: "Santiago",
        base: "Cerrillos + Maipu",
        estado: "Lista para salir",
        chofer: "Jorge Muñoz",
        choferes: ["Jorge Muñoz", "Sergio Reyes", "Carlos Saavedra"],
        vehiculo: "Kia Frontier RX-2230",
        salida: "07:45",
        incidencias: ["Maipu exige confirmacion 30 min antes"],
      },
      {
        id: "ruta-talca",
        nombre: "Talca",
        base: "Talca",
        estado: "En armado",
        chofer: "Luis Rojas",
        choferes: ["Luis Rojas", "Pedro Farias", "Manuel Sepulveda"],
        vehiculo: "Hyundai HD65 TA-1184",
        salida: "08:30",
        incidencias: ["No se confirma ventana de descarga en Frigorifico Talca Sur"],
      },
      {
        id: "ruta-pmontt",
        nombre: "Puerto Montt",
        base: "Puerto Montt",
        estado: "En ruta",
        chofer: "Eduardo Soto",
        choferes: ["Eduardo Soto", "Hector Alvarado", "Javier Oyarzun"],
        vehiculo: "Maxus T60 PM-9021",
        salida: "07:20",
        incidencias: ["Retail Puerto Verde pidio confirmar llegada 20 min antes"],
      },
    ],
    services: [
      {
        id: "srv-000",
        routeId: "ruta-stgo",
        clientId: "cli-004",
        fecha: "2026-07-24",
        hora: "07:50",
        cliente: "Constructora Maipu Norte",
        direccion: "Av. Pajaritos 8120, Maipu",
        tipo: "Retiro programado",
        material: "Metales ferrosos",
        estado: "Borrador",
        kilos: "5.6 ton",
        responsable: "Andrea",
        notas: "Confirmar 30 min antes y dejar estructura en planta.",
      },
      {
        id: "srv-004",
        routeId: "ruta-stgo",
        clientId: "cli-001",
        fecha: "2026-07-24",
        hora: "10:30",
        cliente: "Supermercados Andinos",
        direccion: "Camino Melipilla 14320, Cerrillos",
        tipo: "Retiro material",
        material: "Carton OCC + film",
        estado: "Agendado",
        kilos: "8.2 ton",
        responsable: "Andrea",
        notas: "Descargar en Cerrillos y avisar salida por WhatsApp.",
      },
      {
        id: "srv-005",
        routeId: "ruta-talca",
        clientId: "cli-002",
        fecha: "2026-07-24",
        hora: "08:40",
        cliente: "Frigorifico Talca Sur",
        direccion: "Ruta 5 Sur km 247, Talca",
        tipo: "Salida piloto",
        material: "PEAD",
        estado: "Borrador",
        kilos: "4.1 ton",
        responsable: "Andrea",
        notas: "Esperando validacion final de ventana de descarga.",
      },
      {
        id: "srv-006",
        routeId: "ruta-talca",
        clientId: "cli-002",
        fecha: "2026-07-24",
        hora: "11:15",
        cliente: "Frigorifico Talca Sur · patio 2",
        direccion: "Ruta 5 Sur km 247, Talca",
        tipo: "Retiro material",
        material: "Carton OCC",
        estado: "Agendado",
        kilos: "2.8 ton",
        responsable: "Andrea",
        notas: "Revisar si sale en el mismo camion o en segunda pasada.",
      },
      {
        id: "srv-007",
        routeId: "ruta-pmontt",
        clientId: "cli-003",
        fecha: "2026-07-24",
        hora: "07:20",
        cliente: "Retail Puerto Verde",
        direccion: "Parque Industrial Cardonal 880, Puerto Montt",
        tipo: "Retiro material",
        material: "Carton + PET",
        estado: "Lista para salir",
        kilos: "10.4 ton",
        responsable: "Andrea",
        notas: "Avisar llegada 20 min antes y cerrar con guia firmada.",
      },
      {
        id: "srv-008",
        routeId: "ruta-pmontt",
        clientId: "cli-005",
        fecha: "2026-07-24",
        hora: "11:00",
        cliente: "Agroindustrial Los Robles",
        direccion: "Ruta V-505 km 6, Los Muermos",
        tipo: "Visita programada",
        material: "Plastico agricola",
        estado: "Agendado",
        kilos: "Por definir",
        responsable: "Andrea",
        notas: "Visita de confirmacion para futura reactivacion.",
      },
      {
        id: "srv-001",
        routeId: "ruta-stgo",
        clientId: "cli-001",
        fecha: "2026-07-29",
        hora: "08:15",
        cliente: "Supermercados Andinos",
        direccion: "Camino Melipilla 14320, Cerrillos",
        tipo: "Retiro material",
        material: "Carton OCC",
        estado: "Agendado",
        kilos: "8.2 ton",
        responsable: "Andrea",
        notas: "Retirar antes de las 09:30",
      },
      {
        id: "srv-002",
        routeId: "ruta-talca",
        clientId: "cli-002",
        fecha: "2026-07-31",
        hora: "09:00",
        cliente: "Frigorifico Talca Sur",
        direccion: "Ruta 5 Sur km 247, Talca",
        tipo: "Retiro material",
        material: "PEAD",
        estado: "Agendado",
        kilos: "4.1 ton",
        responsable: "Andrea",
        notas: "Salida piloto",
      },
      {
        id: "srv-003",
        routeId: "ruta-pmontt",
        clientId: "cli-003",
        fecha: "2026-07-30",
        hora: "07:45",
        cliente: "Retail Puerto Verde",
        direccion: "Parque Industrial Cardonal 880, Puerto Montt",
        tipo: "Retiro material",
        material: "Carton + PET",
        estado: "En ruta",
        kilos: "10.4 ton",
        responsable: "Andrea",
        notas: "Avisar llegada 20 min antes",
      },
    ],
    contracts: [
      {
        id: "ct-001",
        clientId: "cli-001",
        oportunidadId: "op-001",
        cliente: "Supermercados Andinos",
        sucursal: "Santiago",
        acuerdo: "Retiro recurrente",
        frecuencia: "Semanal",
        material: "Carton OCC",
        precio: "$ 85/kg",
        vigenciaDesde: "2026-01-01",
        vigenciaHasta: "2026-12-31",
        estado: "Vigente",
        cumplimiento: 92,
        kilos: "182 ton",
        rentabilidad: 18.4,
        proxima: "2026-07-29",
        ultima: "2026-07-18",
        alerta: "Pago pendiente y contrato vence en 19 dias",
        historial: [{ id: uid("cth"), at: created, texto: "Contrato renovado en enero 2026." }],
      },
      {
        id: "ct-002",
        clientId: "cli-003",
        oportunidadId: "op-003",
        cliente: "Retail Puerto Verde",
        sucursal: "Puerto Montt",
        acuerdo: "Servicio periodico",
        frecuencia: "Quincenal",
        material: "Carton + PET",
        precio: "$ 96/kg",
        vigenciaDesde: "2026-03-15",
        vigenciaHasta: "2027-03-15",
        estado: "Vigente",
        cumplimiento: 88,
        kilos: "211 ton",
        rentabilidad: 21.6,
        proxima: "2026-07-30",
        ultima: "2026-07-22",
        alerta: "Monitorear volumen pico de fin de mes",
        historial: [{ id: uid("cth"), at: created, texto: "Se revisa cumplimiento acumulado del trimestre." }],
      },
    ],
    quotes: [
      {
        id: "cot-001",
        clientId: "cli-001",
        titulo: "Supermercados Andinos · retiro film mensual",
        frecuencia: "Semanal",
        lineas: [
          { id: uid("ql"), desc: "Stretch film", qty: 18000, unidad: "kg", precio: 82, costo: 67 },
        ],
        lectura: "Cliente estable, frecuencia clara y retiro compatible con ruta Santiago.",
        updatedAt: created,
      },
      {
        id: "cot-002",
        clientId: "cli-002",
        titulo: "Frigorifico Talca Sur · retiro PEAD",
        frecuencia: "Quincenal",
        lineas: [
          { id: uid("ql"), desc: "PEAD", qty: 8500, unidad: "kg", precio: 73, costo: 65 },
        ],
        lectura: "Caso viable, pero la frecuencia todavia puede tensionar la ruta Talca.",
        updatedAt: created,
      },
    ],
    cobranza: [
      {
        id: "cb-001",
        clientId: "cli-001",
        cliente: "Supermercados Andinos",
        monto: 2480000,
        vencimiento: "2026-07-12",
        estado: "Vencida",
        ejecutivo: "Andrea",
        compromiso: "Pago parcial viernes",
        gestion: "Llamar jueves 16:00",
        observacion: "Cliente activo; conviene seguimiento directo antes de tensar la relacion.",
        timeline: [{ id: uid("cbl"), at: created, texto: "Cliente confirma abono parcial." }],
      },
      {
        id: "cb-002",
        clientId: "cli-004",
        cliente: "Constructora Maipu Norte",
        monto: 890000,
        vencimiento: "2026-07-25",
        estado: "Por vencer",
        ejecutivo: "Andrea",
        compromiso: "Confirmar fecha de pago",
        gestion: "WhatsApp 10:30 y llamada 15:00",
        observacion: "Caso pequeno, pero puede contaminar la negociacion abierta si no se ordena.",
        timeline: [{ id: uid("cbl"), at: created, texto: "Se recuerda vencimiento." }],
      },
    ],
  };
}

let state = null;

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : buildSeed();
  } catch (_error) {
    state = buildSeed();
  }
  return state;
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("comercial:store-updated"));
}

function findClientName(clientId) {
  return load().clients.find((item) => item.id === clientId)?.nombre || "Cliente sin nombre";
}

function money(value) {
  return `$ ${new Intl.NumberFormat("es-CL").format(Number(value || 0))}`;
}

export function getComercialState() {
  return clone(load());
}

export function resetComercialState() {
  state = buildSeed();
  persist();
}

export function listClients() {
  return clone(load().clients);
}

export function saveClient(payload) {
  load();
  const next = {
    ...payload,
    id: payload.id || uid("cli"),
    materiales: Array.isArray(payload.materiales)
      ? payload.materiales
      : String(payload.materiales || "").split(",").map((item) => item.trim()).filter(Boolean),
  };
  const idx = state.clients.findIndex((item) => item.id === next.id);
  if (idx >= 0) {
    state.clients[idx] = { ...state.clients[idx], ...next };
  } else {
    next.timeline = next.timeline || [{ id: uid("ctl"), at: nowIso(), tipo: "Alta", detalle: "Cliente creado en COMERCIAL." }];
    next.saneamiento = next.saneamiento || [];
    next.expedientes = next.expedientes || [];
    state.clients.unshift(next);
  }
  persist();
  return clone(next);
}

export function appendClientTimeline(clientId, tipo, detalle) {
  load();
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) return;
  client.timeline.unshift({ id: uid("ctl"), at: nowIso(), tipo, detalle });
  persist();
}

export function updateClientCategory(clientId, categoria) {
  load();
  const client = state.clients.find((item) => item.id === clientId);
  if (!client) return;
  client.categoria = categoria;
  client.timeline.unshift({ id: uid("ctl"), at: nowIso(), tipo: "Categoria", detalle: `Categoria actualizada a ${categoria}.` });
  persist();
}

export function listClientWorkspace(clientId) {
  load();
  const client = state.clients.find((item) => item.id === clientId);
  const opportunities = state.opportunities.filter((item) => item.clientId === clientId).sort((a, b) => stageOrder(a.etapa) - stageOrder(b.etapa));
  const contracts = state.contracts.filter((item) => item.clientId === clientId);
  const services = state.services.filter((item) => item.clientId === clientId);
  const cobranza = state.cobranza.filter((item) => item.clientId === clientId);
  return clone({ client, opportunities, contracts, services, cobranza });
}

export function listOpportunities() {
  return clone(load().opportunities);
}

export function saveOpportunity(payload) {
  load();
  const next = { ...payload, id: payload.id || uid("op"), seguimiento: payload.seguimiento || [], comentarios: payload.comentarios || [], archivos: payload.archivos || [] };
  const idx = state.opportunities.findIndex((item) => item.id === next.id);
  if (idx >= 0) state.opportunities[idx] = { ...state.opportunities[idx], ...next };
  else state.opportunities.unshift(next);
  persist();
  return clone(next);
}

export function moveOpportunity(id, etapa, motivo = "Movimiento manual") {
  load();
  const row = state.opportunities.find((item) => item.id === id);
  if (!row) return null;
  row.etapa = etapa;
  row.seguimiento.unshift({ id: uid("ops"), at: nowIso(), evento: `${motivo} -> ${etapa}` });
  persist();
  return clone(row);
}

export function takeOpportunity(id, owner = load().currentUser) {
  load();
  const row = state.opportunities.find((item) => item.id === id);
  if (!row) return null;
  row.owner = owner;
  row.seguimiento.unshift({ id: uid("ops"), at: nowIso(), evento: `${owner} toma el caso.` });
  persist();
  return clone(row);
}

export function addOpportunityComment(id, text, autor = load().currentUser) {
  load();
  const row = state.opportunities.find((item) => item.id === id);
  if (!row || !text.trim()) return null;
  row.comentarios.unshift({ id: uid("opc"), autor, at: nowIso(), texto: text.trim() });
  row.seguimiento.unshift({ id: uid("ops"), at: nowIso(), evento: `${autor} agrega comentario.` });
  persist();
  return clone(row);
}

export function addOpportunityFiles(id, files) {
  load();
  const row = state.opportunities.find((item) => item.id === id);
  if (!row || !files?.length) return null;
  files.forEach((file) => {
    row.archivos.unshift({
      id: uid("opf"),
      nombre: file.name,
      size: file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "sin peso",
      at: nowIso(),
    });
  });
  row.seguimiento.unshift({ id: uid("ops"), at: nowIso(), evento: `Se adjuntan ${files.length} archivo(s).` });
  persist();
  return clone(row);
}

export function handoffOpportunityToAgenda(opportunityId) {
  load();
  const opp = state.opportunities.find((item) => item.id === opportunityId);
  if (!opp) return null;
  const route = state.routes.find((item) => item.nombre === opp.sucursal) || state.routes[0];
  const service = {
    id: uid("srv"),
    routeId: route.id,
    clientId: opp.clientId,
    fecha: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    hora: "09:30",
    cliente: findClientName(opp.clientId),
    direccion: state.clients.find((item) => item.id === opp.clientId)?.direccion || "Direccion por confirmar",
    tipo: "Retiro material",
    material: opp.material,
    estado: "Borrador",
    kilos: "Por definir",
    responsable: opp.ejecutivo || state.currentUser,
    notas: `Creado desde oportunidad ${opp.titulo}`,
  };
  state.services.unshift(service);
  opp.seguimiento.unshift({ id: uid("ops"), at: nowIso(), evento: `Handoff a Agenda -> ${service.fecha} ${service.hora}.` });
  persist();
  return clone(service);
}

export function listRoutes() {
  return clone(load().routes);
}

export function saveRoute(payload) {
  load();
  const idx = state.routes.findIndex((item) => item.id === payload.id);
  if (idx < 0) return null;
  state.routes[idx] = { ...state.routes[idx], ...payload };
  persist();
  return clone(state.routes[idx]);
}

export function listServices(routeId = null) {
  const rows = load().services.filter((item) => !routeId || item.routeId === routeId);
  return clone(rows);
}

export function saveService(payload) {
  load();
  const next = { ...payload, id: payload.id || uid("srv") };
  const idx = state.services.findIndex((item) => item.id === next.id);
  if (idx >= 0) state.services[idx] = { ...state.services[idx], ...next };
  else state.services.unshift(next);
  persist();
  return clone(next);
}

export function cancelService(id) {
  load();
  const row = state.services.find((item) => item.id === id);
  if (!row) return null;
  row.estado = "Cancelado";
  persist();
  return clone(row);
}

export function listContracts() {
  return clone(load().contracts);
}

export function saveContract(payload) {
  load();
  const next = { ...payload, id: payload.id || uid("ct"), historial: payload.historial || [] };
  const idx = state.contracts.findIndex((item) => item.id === next.id);
  if (idx >= 0) state.contracts[idx] = { ...state.contracts[idx], ...next };
  else state.contracts.unshift(next);
  persist();
  return clone(next);
}

export function renewContract(id, nuevaVigencia) {
  load();
  const row = state.contracts.find((item) => item.id === id);
  if (!row) return null;
  row.vigenciaHasta = nuevaVigencia;
  row.estado = "Vigente";
  row.historial.unshift({ id: uid("cth"), at: nowIso(), texto: `Contrato renovado hasta ${nuevaVigencia}.` });
  persist();
  return clone(row);
}

export function finalizeContract(id, motivo) {
  load();
  const row = state.contracts.find((item) => item.id === id);
  if (!row) return null;
  row.estado = "Finalizado";
  row.alerta = motivo || "Contrato finalizado";
  row.historial.unshift({ id: uid("cth"), at: nowIso(), texto: `Contrato finalizado. ${motivo || ""}`.trim() });
  persist();
  return clone(row);
}

export function createContractFromOpportunity(opportunityId) {
  load();
  const opp = state.opportunities.find((item) => item.id === opportunityId);
  if (!opp) return null;
  const existing = state.contracts.find((item) => item.oportunidadId === opportunityId);
  if (existing) return clone(existing);
  const contract = {
    id: uid("ct"),
    clientId: opp.clientId,
    oportunidadId: opp.id,
    cliente: findClientName(opp.clientId),
    sucursal: opp.sucursal,
    acuerdo: "Retiro recurrente",
    frecuencia: "Semanal",
    material: opp.material,
    precio: "$ 0/kg",
    vigenciaDesde: new Date().toISOString().slice(0, 10),
    vigenciaHasta: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10),
    estado: "Vigente",
    cumplimiento: 0,
    kilos: "0 ton",
    rentabilidad: 0,
    proxima: "Sin instancia",
    ultima: "—",
    alerta: "Contrato creado desde oportunidad; completar parametros.",
    historial: [{ id: uid("cth"), at: nowIso(), texto: `Contrato creado desde ${opp.titulo}.` }],
  };
  state.contracts.unshift(contract);
  opp.seguimiento.unshift({ id: uid("ops"), at: nowIso(), evento: "Se crea contrato activo desde la oportunidad." });
  persist();
  return clone(contract);
}

export function generateInstancesFromContract(contractId, count = 4) {
  load();
  const contract = state.contracts.find((item) => item.id === contractId);
  if (!contract) return [];
  const route = state.routes.find((item) => item.nombre === contract.sucursal) || state.routes[0];
  const daysMap = { Semanal: 7, Quincenal: 14, Mensual: 30, Variable: 21 };
  const step = daysMap[contract.frecuencia] || 14;
  const createdRows = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.now() + step * 86400000 * (i + 1)).toISOString().slice(0, 10);
    const row = {
      id: uid("srv"),
      routeId: route.id,
      clientId: contract.clientId,
      fecha: date,
      hora: "09:00",
      cliente: contract.cliente,
      direccion: state.clients.find((item) => item.id === contract.clientId)?.direccion || "Direccion por confirmar",
      tipo: "Instancia contrato",
      material: contract.material,
      estado: "Agendado",
      kilos: "Programado",
      responsable: state.currentUser,
      notas: `Instancia generada desde contrato ${contract.id}`,
    };
    state.services.unshift(row);
    createdRows.push(row);
  }
  contract.proxima = createdRows[0]?.fecha || contract.proxima;
  contract.historial.unshift({ id: uid("cth"), at: nowIso(), texto: `Se generan ${createdRows.length} instancia(s) en Agenda.` });
  persist();
  return clone(createdRows);
}

export function listQuotes() {
  return clone(load().quotes);
}

export function saveQuote(payload) {
  load();
  const next = { ...payload, id: payload.id || uid("cot"), updatedAt: nowIso() };
  const idx = state.quotes.findIndex((item) => item.id === next.id);
  if (idx >= 0) state.quotes[idx] = { ...state.quotes[idx], ...next };
  else state.quotes.unshift(next);
  persist();
  return clone(next);
}

export function convertQuoteToOpportunity(quoteId) {
  load();
  const quote = state.quotes.find((item) => item.id === quoteId);
  if (!quote) return null;
  const opportunity = {
    id: uid("op"),
    clientId: quote.clientId,
    titulo: quote.titulo,
    etapa: "Cotizado",
    material: quote.lineas.map((item) => item.desc).join(" + "),
    ejecutivo: state.currentUser,
    sucursal: state.clients.find((item) => item.id === quote.clientId)?.plaza || "Santiago",
    prioridad: "Media",
    probabilidad: 45,
    monto: quote.lineas.reduce((acc, item) => acc + (item.qty * item.precio), 0),
    vencimiento: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
    descripcion: quote.lectura,
    siguiente: "Responder propuesta y mover de etapa.",
    owner: state.currentUser,
    comentarios: [],
    archivos: [],
    seguimiento: [{ id: uid("ops"), at: nowIso(), evento: `Creada desde cotizacion ${quote.titulo}.` }],
    checklist: ["Confirmar precio", "Cerrar frecuencia", "Validar decision maker"],
  };
  state.opportunities.unshift(opportunity);
  persist();
  return clone(opportunity);
}

export function listCobranza() {
  return clone(load().cobranza);
}

export function saveCobranza(payload) {
  load();
  const next = { ...payload, id: payload.id || uid("cb"), timeline: payload.timeline || [] };
  const idx = state.cobranza.findIndex((item) => item.id === next.id);
  if (idx >= 0) state.cobranza[idx] = { ...state.cobranza[idx], ...next };
  else state.cobranza.unshift(next);
  persist();
  return clone(next);
}

export function addCobranzaTimeline(id, text) {
  load();
  const row = state.cobranza.find((item) => item.id === id);
  if (!row || !text.trim()) return null;
  row.timeline.unshift({ id: uid("cbl"), at: nowIso(), texto: text.trim() });
  persist();
  return clone(row);
}

export function listClientOptions() {
  return clone(load().clients.map((item) => ({ id: item.id, nombre: item.nombre, plaza: item.plaza })));
}

export function formatMoney(value) {
  return money(value);
}
