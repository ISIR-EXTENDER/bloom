import type { RuntimeLanguage, WidgetConfig } from "@bloom/api-client";

/**
 * The operator vocabulary the shipped seeds use (design 7c). Seeds are authored in English; the runtime shows these
 * words in the profile's language and leaves any other authored text as written. ES and FR still need a native
 * speaker's check before participant use, STOP and the resume hold above all.
 */
const GLOSSARY: Record<string, { es: string; fr: string }> = {
  Slow: { es: "Lenta", fr: "Lente" },
  Medium: { es: "Media", fr: "Moyenne" },
  Fast: { es: "Rápida", fr: "Rapide" },
  "Max speed": { es: "Velocidad", fr: "Vitesse" },
  "Max turn": { es: "Giro", fr: "Rotation" },
  Both: { es: "Ambos", fr: "Les deux" },
  Snake: { es: "Serpiente", fr: "Serpent" },
  "Hold snake": { es: "Mantener serpiente", fr: "Maintenir serpent" },
  "Neutral shaping": { es: "Movimiento neutro", fr: "Mouvement neutre" },
  "Turn left": { es: "Girar a la izquierda", fr: "Tourner à gauche" },
  "Turn right": { es: "Girar a la derecha", fr: "Tourner à droite" },
  Gripper: { es: "Pinza", fr: "Pince" },
  "Open gripper": { es: "Abrir la pinza", fr: "Ouvrir la pince" },
  "Close gripper": { es: "Cerrar la pinza", fr: "Fermer la pince" },
  open: { es: "abierta", fr: "ouverte" },
  closed: { es: "cerrada", fr: "fermée" },
  commanded: { es: "ordenado", fr: "commandé" },
  Height: { es: "Altura", fr: "Hauteur" },
  Pivot: { es: "Pivote", fr: "Pivot" },
  Translation: { es: "Traslación", fr: "Translation" },
  Rotation: { es: "Rotación", fr: "Rotation" },
  Up: { es: "Subir", fr: "Monter" },
  Down: { es: "Bajar", fr: "Descendre" },
  Forward: { es: "Adelante", fr: "Avant" },
  Back: { es: "Atrás", fr: "Arrière" },
  Left: { es: "Izquierda", fr: "Gauche" },
  Right: { es: "Derecha", fr: "Droite" },
  "Tilt up": { es: "Inclinar arriba", fr: "Incliner vers le haut" },
  "Tilt down": { es: "Inclinar abajo", fr: "Incliner vers le bas" },
  "Roll left": { es: "Rodar a la izquierda", fr: "Rouler à gauche" },
  "Roll right": { es: "Rodar a la derecha", fr: "Rouler à droite" },
  "SHAPING MODE": { es: "MODO DE MOVIMIENTO", fr: "MODE DE MOUVEMENT" },
  "MOVE THE HAND — three linear axes": {
    es: "MOVER LA MANO — tres ejes lineales",
    fr: "DÉPLACER LA MAIN — trois axes linéaires",
  },
  "AIM THE HAND — three angular axes": {
    es: "ORIENTAR LA MANO — tres ejes angulares",
    fr: "ORIENTER LA MAIN — trois axes angulaires",
  },
  "Go home": { es: "Volver al inicio", fr: "Retour à l'origine" },
  "Send Home": { es: "Enviar al inicio", fr: "Envoyer à l'origine" },
  "dispatched once — no progress is reported": {
    es: "enviado una vez — no se informa el progreso",
    fr: "envoyé une fois — aucune progression n'est signalée",
  },
  Release: { es: "Soltar", fr: "Relâcher" },
  "Cancel the pose": { es: "Cancelar la pose", fr: "Annuler la pose" },
  "returns the manager to passthrough": {
    es: "devuelve el gestor al paso directo",
    fr: "remet le gestionnaire en passage direct",
  },
  "Reset fault": { es: "Reiniciar el fallo", fr: "Réinitialiser le défaut" },
  Pause: { es: "Pausar", fr: "Pause" },
  Resume: { es: "Reanudar", fr: "Reprendre" },
  Clear: { es: "Borrar", fr: "Effacer" },
  Copy: { es: "Copiar", fr: "Copier" },
  "Copied to clipboard.": { es: "Copiado al portapapeles.", fr: "Copié dans le presse-papiers." },
  "Copy failed.": { es: "No se pudo copiar.", fr: "La copie a échoué." },
  "SNAKE ON": { es: "SERPIENTE ACTIVA", fr: "SERPENT ACTIVÉ" },
  Neutral: { es: "Neutro", fr: "Neutre" },
  Base: { es: "Base", fr: "Base" },
  Tool: { es: "Herramienta", fr: "Outil" },
  Hybrid: { es: "Híbrido", fr: "Hybride" },
  "Force sensor": { es: "Sensor de fuerza", fr: "Capteur d'effort" },
  "COMMAND FRAME — stamped on every twist": {
    es: "MARCO DE COMANDO — en cada twist",
    fr: "REPÈRE DE COMMANDE — sur chaque twist",
  },
  "SHAPING MODE — requested, never confirmed": {
    es: "MODO DE MOVIMIENTO — solicitado, nunca confirmado",
    fr: "MODE DE MOUVEMENT — demandé, jamais confirmé",
  },
  "SHAPING MODE — requested, the manager never confirms": {
    es: "MODO DE MOVIMIENTO — solicitado, el gestor nunca lo confirma",
    fr: "MODE DE MOUVEMENT — demandé, le gestionnaire ne le confirme jamais",
  },
  "SPEED LIMITS — CONTINUOUS": { es: "LÍMITES DE VELOCIDAD — CONTINUOS", fr: "LIMITES DE VITESSE — CONTINUES" },
  "Max linear speed": { es: "Velocidad lineal máxima", fr: "Vitesse linéaire maximale" },
  "Max angular speed": { es: "Velocidad angular máxima", fr: "Vitesse angulaire maximale" },
  "Saved poses": { es: "Poses guardadas", fr: "Poses enregistrées" },
  "SAVED POSES — dispatched once; the manager reports no progress": {
    es: "POSES GUARDADAS — enviadas una vez; el gestor no informa el progreso",
    fr: "POSES ENREGISTRÉES — envoyées une fois ; le gestionnaire ne signale aucune progression",
  },
  "Joint target": { es: "Objetivo articular", fr: "Cible articulaire" },
  "Current values": { es: "Valores actuales", fr: "Valeurs actuelles" },
  "Mode requests": { es: "Solicitudes de modo", fr: "Demandes de mode" },
  "LIVE FROM THE ROBOT — 30 second window": {
    es: "EN VIVO DEL ROBOT — ventana de 30 segundos",
    fr: "EN DIRECT DU ROBOT — fenêtre de 30 secondes",
  },
  "cartesian_manager SUMS EVERY ACTIVATED INPUT — COMPARE THEM HERE": {
    es: "cartesian_manager SUMA CADA ENTRADA ACTIVADA — COMPÁRALAS AQUÍ",
    fr: "cartesian_manager ADDITIONNE CHAQUE ENTRÉE ACTIVÉE — COMPAREZ-LES ICI",
  },
  // Robot feedback and Command sources: both are reachable from the maintenance sheet.
  "Plot board": { es: "Panel de gráficas", fr: "Tableau de courbes" },
  // Not "this tablet": the topic carries every publisher on it, and ROS gives a subscriber no way to
  // tell them apart. Naming the topic is the most the screen can honestly claim.
  "Command topic": { es: "Tema de comando", fr: "Topic de commande" },
  Series: { es: "Series", fr: "Séries" },
  Sources: { es: "Fuentes", fr: "Sources" },
  "SERIES — tap to plot": { es: "SERIES — toca para graficar", fr: "SÉRIES — touchez pour tracer" },
  "SOURCES — tap to plot": { es: "FUENTES — toca para graficar", fr: "SOURCES — touchez pour tracer" },
  // The field name stays; only the words around it move.
  "linear.x by source": { es: "linear.x por fuente", fr: "linear.x par source" },
  // Screen titles and profile names of the shipped seeds, shown in the kiosk bar and maintenance.
  "Drive · Bench": { es: "Conducción · Banco", fr: "Conduite · Banc" },
  "Drive · Operator": { es: "Conducción · Operador", fr: "Conduite · Opérateur" },
  Positions: { es: "Posiciones", fr: "Positions" },
  "Robot feedback": { es: "Estado del robot", fr: "Retour du robot" },
  "Command sources": { es: "Fuentes de comando", fr: "Sources de commande" },
  "Joystick lab": { es: "Laboratorio de joystick", fr: "Labo joystick" },
  Operator: { es: "Operador", fr: "Opérateur" },
  Bench: { es: "Banco", fr: "Banc" },
  "One switch": { es: "Un pulsador", fr: "Un contacteur" },
  Default: { es: "Predeterminado", fr: "Par défaut" },
};

/** Group labels that name a topic: the words translate, the topic after the dash never does. */
const TOPIC_LABEL_PREFIXES: Record<string, { es: string; fr: string }> = {
  "SENT — ": { es: "ENVIADO — ", fr: "ENVOYÉ — " },
  "WHAT WAS SENT — ": { es: "LO QUE SE ENVIÓ — ", fr: "CE QUI A ÉTÉ ENVOYÉ — " },
};

const ARROWS = /^([▲▼◀▶↶↷]\s*)?(.*?)(\s*[▲▼◀▶↶↷])?$/u;

/** A known operator word in the profile's language; arrows stay where they were, anything else is left as written. */
export function localizeOperatorText(text: string, language: RuntimeLanguage | undefined): string {
  if (!language || language === "en") {
    return text;
  }
  const [, before = "", core = "", after = ""] = text.match(ARROWS) ?? [];
  const translated = GLOSSARY[core]?.[language] ?? localizeTopicLabel(core, language);
  return translated ? `${before}${translated}${after}` : text;
}

function localizeTopicLabel(text: string, language: "es" | "fr"): string | undefined {
  const prefix = Object.keys(TOPIC_LABEL_PREFIXES).find((candidate) => text.startsWith(candidate));
  const topic = prefix ? text.slice(prefix.length) : "";
  return prefix && /^\/\S+$/.test(topic) ? `${TOPIC_LABEL_PREFIXES[prefix][language]}${topic}` : undefined;
}

const TEXT_SETTINGS = [
  "button_label",
  "hint",
  "onLabel",
  "offLabel",
  "onStateLabel",
  "offStateLabel",
  "pressed_label",
  "released_label",
  "text",
];

/** The widget as the operator reads it. Only display words change; ids, topics and payloads are untouched. */
export function localizeWidget(widget: WidgetConfig, language: RuntimeLanguage | undefined): WidgetConfig {
  if (!language || language === "en") {
    return widget;
  }
  const settings: Record<string, unknown> = { ...widget.settings };
  for (const key of TEXT_SETTINGS) {
    if (typeof settings[key] === "string") {
      settings[key] = localizeOperatorText(settings[key] as string, language);
    }
  }
  if (Array.isArray(settings.segment_labels)) {
    settings.segment_labels = settings.segment_labels.map((label) =>
      typeof label === "string" ? localizeOperatorText(label, language) : label,
    );
  }
  if (typeof settings.labels === "object" && settings.labels !== null && !Array.isArray(settings.labels)) {
    settings.labels = Object.fromEntries(
      Object.entries(settings.labels).map(([key, label]) => [
        key,
        typeof label === "string" ? localizeOperatorText(label, language) : label,
      ]),
    );
  }
  return { ...widget, settings, title: localizeOperatorText(widget.title, language) };
}

/** The echo's empty line, where the sentence has to be built around the widget's own title. */
export function localizeEmptyEcho(title: string, language: RuntimeLanguage | undefined): string {
  if (language === "es") {
    return `No se ha publicado ningún ${title} en esta sesión.`;
  }
  if (language === "fr") {
    return `Aucun ${title} n'a été publié pendant cette session.`;
  }
  return `No ${title} has been published this session.`;
}
