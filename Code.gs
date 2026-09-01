/**
 * ==========================================================================
 * OWFIT · Encuesta de pricing · Backend en Google Apps Script
 * --------------------------------------------------------------------------
 * Recibe el JSON que envía script.js, valida los datos y agrega una fila
 * en la hoja de cálculo. Crea los encabezados automáticamente la primera vez.
 * ==========================================================================
 */

// Nombre de la pestaña donde se guardan las respuestas.
// Si no existe, el script la crea sola.
var SHEET_NAME = 'Respuestas';

// Orden exacto de las columnas de la hoja.
var HEADERS = [
  'Timestamp',
  'Age',
  'Buys_Sportswear',
  'Sportswear_Purchase_Frequency',
  'Usual_Spending',
  'Ranking_Price',
  'Ranking_Quality',
  'Ranking_Comfort',
  'Ranking_Durability',
  'Ranking_Design',
  'Purchase_Channels',
  'Main_Purchase_Channel',
  'Packaging_Importance',
  'Too_Cheap',
  'Good_Value',
  'Expensive',
  'Too_Expensive',
  'Purchase_Intention_699',
  'Purchase_Intention_799',
  'Purchase_Intention_899',
  'Purchase_Intention_999',
  'Purchase_Intention_1099',
  'Price_Display_Order',
  'Survey_URL'
];

/**
 * Punto de entrada del POST que manda la encuesta.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // evita que dos respuestas simultáneas se pisen

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ status: 'error', message: 'No se recibieron datos.' });
    }

    var data = JSON.parse(e.postData.contents);

    var errores = validar_(data);
    if (errores.length > 0) {
      return jsonResponse_({ status: 'error', message: 'Datos inválidos: ' + errores.join(', ') });
    }

    var sheet = getSheet_();
    ensureHeaders_(sheet);
    sheet.appendRow(buildRow_(data));

    return jsonResponse_({
      status: 'success',
      message: 'Respuesta registrada',
      row: sheet.getLastRow()
    });

  } catch (err) {
    return jsonResponse_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sirve para comprobar desde el navegador que el Web App está publicado.
 * Abre la URL /exec en una pestaña: debe responder un JSON con status ok.
 */
function doGet() {
  return jsonResponse_({ status: 'ok', message: 'Web App de la encuesta OWFIT activo' });
}

/* -------------------------------------------------------------------------- */
/* Funciones auxiliares                                                        */
/* -------------------------------------------------------------------------- */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function validar_(data) {
  var errores = [];

  if (!data || typeof data !== 'object') {
    return ['el cuerpo no es un objeto'];
  }
  if (!data.age) {
    errores.push('falta la edad');
  }

  var precios = ['too_cheap', 'good_value', 'expensive', 'too_expensive'];
  for (var i = 0; i < precios.length; i++) {
    var valor = data[precios[i]];
    if (typeof valor !== 'number' || !isFinite(valor) || valor <= 0) {
      errores.push('precio inválido en ' + precios[i]);
    }
  }

  var intenciones = [699, 799, 899, 999, 1099];
  for (var j = 0; j < intenciones.length; j++) {
    var clave = 'purchase_intention_' + intenciones[j];
    var v = data[clave];
    if (typeof v !== 'number' || v < 1 || v > 5) {
      errores.push('intención inválida en ' + clave);
    }
  }

  return errores;
}

function buildRow_(data) {
  var ranking = data.factor_ranking || {};
  var canales = Array.isArray(data.purchase_channels)
    ? data.purchase_channels.join('; ')
    : (data.purchase_channels || '');

  return [
    data.timestamp || new Date().toISOString(),
    data.age || '',
    data.buys_sportswear || '',
    data.sportswear_purchase_frequency || '',
    data.usual_spending || '',
    ranking['Precio'] || '',
    ranking['Calidad'] || '',
    ranking['Comodidad'] || '',
    ranking['Durabilidad'] || '',
    ranking['Diseño'] || '',
    canales,
    data.main_purchase_channel || '',
    data.packaging_importance || '',
    data.too_cheap,
    data.good_value,
    data.expensive,
    data.too_expensive,
    data.purchase_intention_699,
    data.purchase_intention_799,
    data.purchase_intention_899,
    data.purchase_intention_999,
    data.purchase_intention_1099,
    data.price_display_order || '',
    data.survey_url || ''
  ];
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* -------------------------------------------------------------------------- */
/* Prueba rápida sin abrir la encuesta                                         */
/* Selecciona testInsertarFila en el menú de funciones y presiona Ejecutar.    */
/* Debe aparecer una fila de prueba en la hoja.                                */
/* -------------------------------------------------------------------------- */

function testInsertarFila() {
  var ejemplo = {
    timestamp: new Date().toISOString(),
    age: '18-24',
    buys_sportswear: 'Sí, frecuentemente',
    sportswear_purchase_frequency: 'Cada 2-3 meses',
    usual_spending: '$700-$899',
    factor_ranking: { 'Precio': 3, 'Calidad': 1, 'Comodidad': 2, 'Durabilidad': 4, 'Diseño': 5 },
    purchase_channels: ['Tiendas físicas de marca', 'Sitios web oficiales de marcas'],
    main_purchase_channel: 'Sitio web oficial',
    packaging_importance: 3,
    too_cheap: 500,
    good_value: 800,
    expensive: 1000,
    too_expensive: 1400,
    purchase_intention_699: 5,
    purchase_intention_799: 4,
    purchase_intention_899: 4,
    purchase_intention_999: 3,
    purchase_intention_1099: 2,
    price_display_order: '899|699|1099|799|999',
    survey_url: 'PRUEBA'
  };

  var errores = validar_(ejemplo);
  if (errores.length) throw new Error(errores.join(', '));

  var sheet = getSheet_();
  ensureHeaders_(sheet);
  sheet.appendRow(buildRow_(ejemplo));
}
