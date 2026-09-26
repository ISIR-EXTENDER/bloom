import type { RuntimeLanguage } from "@bloom/api-client";

/**
 * Status words the renderers write themselves, in the profile's language. The runtime chrome has its own
 * table; these were English on a French or Spanish screen. ES and FR still need a native speaker's check.
 */
const STRINGS = {
  en: {
    cameraClosed: "The camera stream closed.",
    cameraConnecting: "Connecting…",
    cameraNameTopic: "Name a compressed image topic to show a camera.",
    cameraNoRos: "This backend has no ROS node, so no camera can reach it.",
    cameraReconnecting: "Reconnecting…",
    cameraStale: (seconds: number) => `No new frame for ${seconds} s`,
    cameraStalled: "The camera stopped sending.",
    cameraWaiting: (topic: string) => `Waiting for a frame on ${topic}.`,
    jointsStale: (seconds: number) => `No joint state for ${seconds} s. The robot is drawn where it last was.`,
    jointsStalled: "Joint states stopped arriving.",
    notSent: "Not sent.",
  },
  fr: {
    cameraClosed: "Le flux de la caméra s'est fermé.",
    cameraConnecting: "Connexion…",
    cameraNameTopic: "Indiquez un topic d'image compressée pour afficher une caméra.",
    cameraNoRos: "Ce serveur n'a pas de nœud ROS : aucune caméra ne peut l'atteindre.",
    cameraReconnecting: "Reconnexion…",
    cameraStale: (seconds: number) => `Aucune nouvelle image depuis ${seconds} s`,
    cameraStalled: "La caméra n'envoie plus d'images.",
    cameraWaiting: (topic: string) => `En attente d'une image sur ${topic}.`,
    jointsStale: (seconds: number) =>
      `Aucun état articulaire depuis ${seconds} s. Le robot est dessiné à sa dernière position.`,
    jointsStalled: "Les états articulaires n'arrivent plus.",
    notSent: "Non envoyé.",
  },
  es: {
    cameraClosed: "El flujo de la cámara se cerró.",
    cameraConnecting: "Conectando…",
    cameraNameTopic: "Indique un topic de imagen comprimida para mostrar una cámara.",
    cameraNoRos: "Este servidor no tiene nodo ROS: ninguna cámara puede llegar.",
    cameraReconnecting: "Reconectando…",
    cameraStale: (seconds: number) => `Ninguna imagen nueva desde hace ${seconds} s`,
    cameraStalled: "La cámara dejó de enviar imágenes.",
    cameraWaiting: (topic: string) => `Esperando una imagen en ${topic}.`,
    jointsStale: (seconds: number) =>
      `Ningún estado articular desde hace ${seconds} s. El robot se dibuja donde estaba.`,
    jointsStalled: "Los estados articulares dejaron de llegar.",
    notSent: "No enviado.",
  },
} as const;

export function rendererStrings(language: RuntimeLanguage | undefined) {
  return STRINGS[language === "fr" || language === "es" ? language : "en"];
}
