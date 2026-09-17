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
};

const ARROWS = /^([▲▼◀▶↶↷]\s*)?(.*?)(\s*[▲▼◀▶↶↷])?$/u;

/** A known operator word in the profile's language; arrows stay where they were, anything else is left as written. */
export function localizeOperatorText(text: string, language: RuntimeLanguage | undefined): string {
  if (!language || language === "en") {
    return text;
  }
  const [, before = "", core = "", after = ""] = text.match(ARROWS) ?? [];
  const translated = GLOSSARY[core]?.[language];
  return translated ? `${before}${translated}${after}` : text;
}

const TEXT_SETTINGS = ["button_label", "hint", "onLabel", "offLabel", "onStateLabel", "offStateLabel", "text"];

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
