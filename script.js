/* ==========================================================================
   OWFIT · Encuesta de pricing · Lógica de la encuesta
   ========================================================================== */

// ==========================================
// CONFIGURACIÓN
// ==========================================

// URL del Google Apps Script Web App.
// AQUÍ PEGAS LA URL QUE TE DA GOOGLE al hacer "Implementar > Nueva implementación > Aplicación web".
// Debe terminar en /exec  (NO uses la que termina en /dev).
// Ejemplo del formato: https://script.google.com/macros/s/AKfycb.../exec
const GOOGLE_SCRIPT_URL = "PEGA_AQUÍ_TU_URL_DE_GOOGLE_APPS_SCRIPT";

// URL pública de la encuesta en Netlify.
// AQUÍ PEGAS LA URL que te asigna Netlify después de publicar el sitio.
// Solo se usa para mostrar la liga para compartir en la pantalla final y para registrarla en la hoja.
// Ejemplo del formato: https://encuesta-owfit.netlify.app
const NETLIFY_SURVEY_URL = "PEGA_AQUÍ_TU_URL_DE_NETLIFY";

// ==========================================
// FIN DE LA CONFIGURACIÓN (no necesitas tocar nada más abajo)
// ==========================================


/* --------------------------------------------------------------------------
   Constantes de la encuesta
   -------------------------------------------------------------------------- */

const FACTORES = ["Precio", "Calidad", "Comodidad", "Durabilidad", "Diseño"];

const PRECIOS_INTENCION = [699, 799, 899, 999, 1099];

const ESCALA_EMPAQUE = [
  "Nada importante",
  "Poco importante",
  "Moderadamente importante",
  "Importante",
  "Muy importante"
];

const ESCALA_INTENCION = [
  "Definitivamente no lo compraría",
  "Probablemente no lo compraría",
  "No estoy segura",
  "Probablemente lo compraría",
  "Definitivamente lo compraría"
];

const STORAGE_KEY = "owfit_encuesta_borrador";

/* --------------------------------------------------------------------------
   Estado
   -------------------------------------------------------------------------- */

const pantallas = Array.from(document.querySelectorAll(".screen"));
const indiceUltimaSeccion = pantallas.length - 2; // la última pantalla es "gracias"
let indiceActual = 0;

let enviando = false;   // evita envíos dobles mientras se espera al servidor
let enviado = false;    // evita reenviar una respuesta ya registrada

const respuestas = {};  // objeto JSON que se va llenando durante la encuesta

const el = {
  topbar:       document.getElementById("topbar"),
  progress:     document.getElementById("progress"),
  progressFill: document.getElementById("progressFill"),
  stepLabel:    document.getElementById("stepLabel"),
  navbar:       document.getElementById("navbar"),
  btnBack:      document.getElementById("btnBack"),
  btnNext:      document.getElementById("btnNext"),
  btnStart:     document.getElementById("btnStart"),
  sendStatus:   document.getElementById("sendStatus"),
  vwNotice:     document.getElementById("vwNotice"),
  rankList:     document.getElementById("rankList"),
  intentionList:document.getElementById("intentionList"),
  shareNote:    document.getElementById("shareNote"),
  shareLink:    document.getElementById("shareLink")
};


/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */

function barajar(arr) {
  const copia = arr.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function formatoMXN(n) {
  return "$" + n.toLocaleString("es-MX");
}


/* --------------------------------------------------------------------------
   Construcción dinámica: escalas Likert
   -------------------------------------------------------------------------- */

function construirLikert(contenedor, nombre, etiquetas) {
  contenedor.innerHTML = "";
  etiquetas.forEach((texto, i) => {
    const valor = i + 1;
    const label = document.createElement("label");
    label.className = "likert-opt";
    label.innerHTML =
      '<input type="radio" name="' + nombre + '" value="' + valor + '">' +
      '<span class="likert-box">' +
        '<span class="likert-num">' + valor + '</span>' +
        '<span class="likert-text">' + texto + '</span>' +
      '</span>';
    contenedor.appendChild(label);
  });
}

// Pregunta 8 · importancia del empaque
construirLikert(document.querySelector('[data-likert="packaging_importance"]'), "packaging_importance", ESCALA_EMPAQUE);


/* --------------------------------------------------------------------------
   Sección 5 · intención de compra con precios en orden aleatorio
   -------------------------------------------------------------------------- */

// El orden en pantalla se aleatoriza para reducir el sesgo de orden,
// pero cada respuesta se guarda asociada a su precio original.
const ordenPrecios = barajar(PRECIOS_INTENCION);

ordenPrecios.forEach(precio => {
  const fila = document.createElement("div");
  fila.className = "price-row q";
  fila.dataset.type = "radio";
  fila.dataset.name = "pi_" + precio;
  fila.dataset.required = "true";
  fila.innerHTML =
    '<p class="price-tag">' + formatoMXN(precio) + '<small>MXN</small></p>' +
    '<div class="likert" data-likert="pi_' + precio + '"></div>' +
    '<p class="err" hidden>Elige una opción para continuar.</p>';
  el.intentionList.appendChild(fila);
  construirLikert(fila.querySelector(".likert"), "pi_" + precio, ESCALA_INTENCION);
});


/* --------------------------------------------------------------------------
   Pregunta 5 · ranking con arrastrar y soltar (mouse + touch)
   -------------------------------------------------------------------------- */

// El orden inicial también se aleatoriza para no sugerir un ranking.
barajar(FACTORES).forEach(factor => {
  const li = document.createElement("li");
  li.className = "rank-item";
  li.dataset.factor = factor;
  li.innerHTML =
    '<button class="grip" type="button" aria-label="Arrastrar ' + factor + '"><span class="grip-dots"></span></button>' +
    '<span class="rank-pos"></span>' +
    '<span class="rank-name">' + factor + '</span>' +
    '<button class="rank-move" type="button" data-dir="-1" aria-label="Subir ' + factor + '">&#9650;</button>' +
    '<button class="rank-move" type="button" data-dir="1" aria-label="Bajar ' + factor + '">&#9660;</button>';
  el.rankList.appendChild(li);
});

function actualizarPosiciones() {
  const items = Array.from(el.rankList.children);
  items.forEach((item, i) => {
    item.querySelector(".rank-pos").textContent = i + 1;
    item.querySelector('[data-dir="-1"]').disabled = (i === 0);
    item.querySelector('[data-dir="1"]').disabled = (i === items.length - 1);
  });
}
actualizarPosiciones();

// Flechas (accesible y siempre disponible como alternativa al arrastre)
el.rankList.addEventListener("click", (e) => {
  const boton = e.target.closest(".rank-move");
  if (!boton) return;
  const item = boton.closest(".rank-item");
  const dir = Number(boton.dataset.dir);
  if (dir === -1 && item.previousElementSibling) {
    el.rankList.insertBefore(item, item.previousElementSibling);
  } else if (dir === 1 && item.nextElementSibling) {
    el.rankList.insertBefore(item.nextElementSibling, item);
  }
  actualizarPosiciones();
  guardarBorrador();
});

// Arrastre con Pointer Events: funciona igual con mouse, touch y stylus.
let arrastrado = null;
let yInicial = 0;

el.rankList.addEventListener("pointerdown", (e) => {
  const asa = e.target.closest(".grip");
  if (!asa) return;
  arrastrado = asa.closest(".rank-item");
  yInicial = e.clientY;
  arrastrado.classList.add("dragging");
  document.body.classList.add("is-dragging");
  asa.setPointerCapture(e.pointerId);
});

el.rankList.addEventListener("pointermove", (e) => {
  if (!arrastrado) return;
  e.preventDefault();
  const dy = e.clientY - yInicial;
  arrastrado.style.transform = "translateY(" + dy + "px)";

  const caja = arrastrado.getBoundingClientRect();
  const centro = caja.top + caja.height / 2;

  const otros = Array.from(el.rankList.children).filter(i => i !== arrastrado);
  for (const otro of otros) {
    const r = otro.getBoundingClientRect();
    const centroOtro = r.top + r.height / 2;
    const estaDespues = arrastrado.compareDocumentPosition(otro) & Node.DOCUMENT_POSITION_FOLLOWING;

    if (centro < centroOtro && !estaDespues) {
      el.rankList.insertBefore(arrastrado, otro);
      yInicial = e.clientY; arrastrado.style.transform = ""; break;
    }
    if (centro > centroOtro && estaDespues) {
      el.rankList.insertBefore(arrastrado, otro.nextSibling);
      yInicial = e.clientY; arrastrado.style.transform = ""; break;
    }
  }
  actualizarPosiciones();
});

function terminarArrastre() {
  if (!arrastrado) return;
  arrastrado.style.transform = "";
  arrastrado.classList.remove("dragging");
  document.body.classList.remove("is-dragging");
  arrastrado = null;
  actualizarPosiciones();
  guardarBorrador();
}
el.rankList.addEventListener("pointerup", terminarArrastre);
el.rankList.addEventListener("pointercancel", terminarArrastre);


/* --------------------------------------------------------------------------
   Pregunta 2 · si responde "No", las preguntas 3 y 4 pasan a ser opcionales
   -------------------------------------------------------------------------- */

document.querySelectorAll('input[name="buys_sportswear"]').forEach(input => {
  input.addEventListener("change", () => {
    const noCompra = input.value === "No" && input.checked;
    ["q3", "q4"].forEach(id => {
      const q = document.getElementById(id);
      q.dataset.required = noCompra ? "false" : "true";
      q.querySelector(".optional-tag").hidden = !noCompra;
      if (noCompra) limpiarError(q);
    });
  });
});


/* --------------------------------------------------------------------------
   Validación
   -------------------------------------------------------------------------- */

function mostrarError(q, mensaje) {
  q.classList.add("has-error");
  const p = q.querySelector(".err");
  if (p) {
    if (mensaje) p.textContent = mensaje;
    p.hidden = false;
  }
}

function limpiarError(q) {
  q.classList.remove("has-error");
  const p = q.querySelector(".err");
  if (p) p.hidden = true;
}

function preguntaRespondida(q) {
  const tipo = q.dataset.type;
  const nombre = q.dataset.name;

  if (tipo === "radio") {
    return !!document.querySelector('input[name="' + nombre + '"]:checked');
  }
  if (tipo === "checkbox") {
    return document.querySelectorAll('input[name="' + nombre + '"]:checked').length > 0;
  }
  if (tipo === "money") {
    const input = document.querySelector('input[name="' + nombre + '"]');
    const valor = Number(input.value);
    return input.value.trim() !== "" && isFinite(valor) && valor > 0;
  }
  if (tipo === "ranking") {
    return true; // el ranking siempre tiene un orden válido
  }
  return true;
}

function validarPantalla(pantalla) {
  let valida = true;
  let primerFallo = null;

  pantalla.querySelectorAll(".q").forEach(q => {
    if (q.dataset.required === "false") { limpiarError(q); return; }
    if (preguntaRespondida(q)) {
      limpiarError(q);
    } else {
      mostrarError(q);
      valida = false;
      if (!primerFallo) primerFallo = q;
    }
  });

  // Validación adicional de Van Westendorp
  if (valida && pantalla.dataset.screen === "4") {
    const resultado = validarVanWestendorp();
    if (!resultado.ok) {
      el.vwNotice.hidden = false;
      el.vwNotice.innerHTML = "<strong>Revisa tus precios</strong>" + resultado.mensaje;
      primerFallo = el.vwNotice;
      valida = false;
    } else {
      el.vwNotice.hidden = true;
    }
  }

  if (primerFallo) {
    primerFallo.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return valida;
}

// Orden lógico esperado: too_cheap <= good_value <= expensive <= too_expensive
// No corregimos los valores: solo pedimos a la persona que los revise.
function validarVanWestendorp() {
  const v = nombre => Number(document.querySelector('input[name="' + nombre + '"]').value);
  const tooCheap = v("too_cheap");
  const goodValue = v("good_value");
  const expensive = v("expensive");
  const tooExpensive = v("too_expensive");

  const problemas = [];
  if (tooCheap > goodValue) problemas.push("el precio “demasiado barato” es mayor que el de “buena compra”");
  if (goodValue > expensive) problemas.push("el precio de “buena compra” es mayor que el precio “caro”");
  if (expensive > tooExpensive) problemas.push("el precio “caro” es mayor que el “demasiado caro”");

  if (problemas.length === 0) return { ok: true };

  return {
    ok: false,
    mensaje: "Para que las respuestas tengan sentido, los precios deben ir de menor a mayor: " +
             "demasiado barato, buena compra, caro y demasiado caro. En tus respuestas " +
             problemas.join("; ") + ". Ajusta los montos y continúa."
  };
}

// Al escribir o elegir, se limpia el error de esa pregunta
document.addEventListener("input", (e) => {
  const q = e.target.closest(".q");
  if (q) limpiarError(q);
  if (el.vwNotice) el.vwNotice.hidden = true;
  guardarBorrador();
});
document.addEventListener("change", (e) => {
  const q = e.target.closest(".q");
  if (q) limpiarError(q);
  guardarBorrador();
});


/* --------------------------------------------------------------------------
   Recolección de respuestas
   -------------------------------------------------------------------------- */

function valorRadio(nombre) {
  const input = document.querySelector('input[name="' + nombre + '"]:checked');
  return input ? input.value : "";
}

function valoresCheckbox(nombre) {
  return Array.from(document.querySelectorAll('input[name="' + nombre + '"]:checked')).map(i => i.value);
}

function valorNumero(nombre) {
  const input = document.querySelector('input[name="' + nombre + '"]');
  return input.value.trim() === "" ? null : Number(input.value);
}

function rankingActual() {
  const ranking = {};
  Array.from(el.rankList.children).forEach((item, i) => {
    ranking[item.dataset.factor] = i + 1;   // 1 = más importante
  });
  return ranking;
}

// Guarda en el objeto "respuestas" todo lo contestado hasta el momento.
function recolectarRespuestas() {
  respuestas.timestamp = new Date().toISOString();
  respuestas.age = valorRadio("age");
  respuestas.buys_sportswear = valorRadio("buys_sportswear");
  respuestas.sportswear_purchase_frequency = valorRadio("purchase_frequency");
  respuestas.usual_spending = valorRadio("usual_spending");
  respuestas.factor_ranking = rankingActual();
  respuestas.purchase_channels = valoresCheckbox("purchase_channels");
  respuestas.main_purchase_channel = valorRadio("main_purchase_channel");
  respuestas.packaging_importance = Number(valorRadio("packaging_importance")) || null;

  respuestas.too_cheap = valorNumero("too_cheap");
  respuestas.good_value = valorNumero("good_value");
  respuestas.expensive = valorNumero("expensive");
  respuestas.too_expensive = valorNumero("too_expensive");

  PRECIOS_INTENCION.forEach(precio => {
    respuestas["purchase_intention_" + precio] = Number(valorRadio("pi_" + precio)) || null;
  });

  // Metadatos útiles para el análisis (no identifican a la persona)
  respuestas.price_display_order = ordenPrecios.join("|");
  respuestas.survey_url = NETLIFY_SURVEY_URL;

  return respuestas;
}

// Borrador local: si la persona recarga la página por accidente, no pierde lo escrito.
function guardarBorrador() {
  try {
    const datos = {};
    document.querySelectorAll("input").forEach(input => {
      if (input.type === "radio" || input.type === "checkbox") {
        if (input.checked) {
          datos[input.name] = datos[input.name] || [];
          datos[input.name].push(input.value);
        }
      } else if (input.value !== "") {
        datos[input.name] = input.value;
      }
    });
    datos.__ranking = Array.from(el.rankList.children).map(i => i.dataset.factor);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datos));
  } catch (e) { /* si el navegador bloquea el almacenamiento, la encuesta sigue funcionando */ }
}

function restaurarBorrador() {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return;
    const datos = JSON.parse(crudo);

    if (Array.isArray(datos.__ranking)) {
      datos.__ranking.forEach(factor => {
        const item = el.rankList.querySelector('[data-factor="' + CSS.escape(factor) + '"]');
        if (item) el.rankList.appendChild(item);
      });
      actualizarPosiciones();
    }

    Object.keys(datos).forEach(nombre => {
      if (nombre === "__ranking") return;
      const valor = datos[nombre];
      if (Array.isArray(valor)) {
        valor.forEach(v => {
          const input = document.querySelector('input[name="' + nombre + '"][value="' + CSS.escape(v) + '"]');
          if (input) input.checked = true;
        });
      } else {
        const input = document.querySelector('input[name="' + nombre + '"]');
        if (input) input.value = valor;
      }
    });
  } catch (e) { /* borrador ilegible: se ignora */ }
}

function borrarBorrador() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}


/* --------------------------------------------------------------------------
   Navegación entre pantallas
   -------------------------------------------------------------------------- */

function mostrarPantalla(indice) {
  indiceActual = indice;
  pantallas.forEach((p, i) => p.classList.toggle("is-active", i === indice));

  const esBienvenida = indice === 0;
  const esGracias = indice === pantallas.length - 1;
  const esSeccion = !esBienvenida && !esGracias;

  el.progress.hidden = !esSeccion;
  el.stepLabel.hidden = !esSeccion;
  el.navbar.hidden = !esSeccion;

  if (esSeccion) {
    const total = indiceUltimaSeccion;               // 5 secciones
    el.progressFill.style.width = (indice / total * 100) + "%";
    el.stepLabel.textContent = "Paso " + indice + " de " + total;
    el.btnBack.hidden = (indice === 1);
    el.btnNext.textContent = (indice === indiceUltimaSeccion) ? "Enviar respuestas" : "Continuar";
    el.btnNext.disabled = false;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

el.btnStart.addEventListener("click", () => mostrarPantalla(1));

el.btnBack.addEventListener("click", () => {
  // Regresar nunca borra respuestas: las pantallas permanecen en el DOM.
  if (indiceActual > 1) mostrarPantalla(indiceActual - 1);
});

el.btnNext.addEventListener("click", () => {
  if (enviando) return;
  const pantalla = pantallas[indiceActual];

  if (!validarPantalla(pantalla)) return;
  recolectarRespuestas();
  guardarBorrador();

  if (indiceActual < indiceUltimaSeccion) {
    mostrarPantalla(indiceActual + 1);
  } else {
    enviarRespuestas();
  }
});


/* --------------------------------------------------------------------------
   Envío a Google Apps Script
   -------------------------------------------------------------------------- */

function validarTodo() {
  // Revisa todas las secciones antes de enviar y lleva a la primera con problemas.
  for (let i = 1; i <= indiceUltimaSeccion; i++) {
    const pantalla = pantallas[i];
    const guardado = indiceActual;
    // La validación necesita que la pantalla exista en el DOM; ya está, no hace falta mostrarla.
    if (!validarPantalla(pantalla)) {
      if (guardado !== i) mostrarPantalla(i);
      setTimeout(() => validarPantalla(pantalla), 400); // reposiciona el scroll en la pantalla correcta
      return false;
    }
  }
  return true;
}

async function enviarRespuestas() {
  if (enviando || enviado) return;

  if (GOOGLE_SCRIPT_URL.indexOf("http") !== 0) {
    mostrarEstado("Falta configurar GOOGLE_SCRIPT_URL en script.js.", true);
    return;
  }
  if (!validarTodo()) return;

  const datos = recolectarRespuestas();

  enviando = true;
  el.btnNext.disabled = true;
  el.btnBack.disabled = true;
  el.btnNext.textContent = "Enviando respuesta…";
  mostrarEstado("Enviando respuesta…", false);

  try {
    // Content-Type text/plain evita la petición preflight de CORS,
    // que Google Apps Script no responde. El script lee el cuerpo como JSON.
    const respuesta = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(datos),
      redirect: "follow"
    });

    if (!respuesta.ok) throw new Error("HTTP " + respuesta.status);

    const resultado = await respuesta.json();
    if (resultado.status !== "success") throw new Error(resultado.message || "Respuesta inesperada del servidor");

    enviado = true;
    borrarBorrador();
    ocultarEstado();
    mostrarPantalla(pantallas.length - 1);
    mostrarLigaParaCompartir();

  } catch (error) {
    // Las respuestas siguen en pantalla: nada se borra.
    mostrarEstado("No pudimos guardar tu respuesta. Revisa tu conexión e inténtalo otra vez.", true);
    el.btnNext.textContent = "Intentar nuevamente";
    el.btnNext.disabled = false;
    el.btnBack.disabled = false;
    console.error("Error al enviar la encuesta:", error);
  } finally {
    enviando = false;
  }
}

function mostrarEstado(texto, esError) {
  el.sendStatus.textContent = texto;
  el.sendStatus.classList.toggle("is-error", !!esError);
  el.sendStatus.hidden = false;
}
function ocultarEstado() { el.sendStatus.hidden = true; }

function mostrarLigaParaCompartir() {
  if (NETLIFY_SURVEY_URL.indexOf("http") !== 0) return;
  el.shareLink.href = NETLIFY_SURVEY_URL;
  el.shareLink.textContent = NETLIFY_SURVEY_URL;
  el.shareNote.hidden = false;
}


/* --------------------------------------------------------------------------
   Arranque
   -------------------------------------------------------------------------- */

restaurarBorrador();

// Si el borrador ya tenía marcada la P2, aplicamos la regla de opcionalidad de P3 y P4.
const p2Marcada = document.querySelector('input[name="buys_sportswear"]:checked');
if (p2Marcada) p2Marcada.dispatchEvent(new Event("change", { bubbles: true }));

mostrarPantalla(0);

// Aviso si alguien intenta cerrar la pestaña con la encuesta a medias
window.addEventListener("beforeunload", (e) => {
  if (indiceActual > 0 && !enviado) {
    e.preventDefault();
    e.returnValue = "";
  }
});
