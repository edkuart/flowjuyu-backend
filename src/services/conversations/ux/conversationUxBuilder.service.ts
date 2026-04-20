import {
  UX_COMMANDS,
  UX_LIST_LIMIT,
} from "./conversationUxTemplates";
import { buildUxResponse } from "../ux-config/uxResponseBuilder.service";
import type {
  ConversationUxErrorType,
  UxEditFeedback,
  UxEditModeField,
  UxEditSummaryChange,
  UxMenuProductItem,
  UxProductView,
  UxProfileSummary,
} from "./conversationUxTypes";

function money(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "Pendiente" : `Q${value.toFixed(2)}`;
}

function lines(parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join("\n");
}

export function buildOnboardingMessage(): string {
  return lines([
    "👋 Bienvenido a tu espacio de vendedor",
    "",
    "Este número todavía no está vinculado a una cuenta.",
    "Genera tu código en la web y envíamelo por este chat para activar tu espacio de trabajo.",
    "",
    "Siguiente paso:",
    "👉 genera el código en la web",
    "👉 pégalo aquí tal como aparece",
  ]);
}

export function buildRecognizedUnlinkedSellerMessage(
  nombreComercio: string
): string {
  return lines([
    "👋 Ya te reconocí como vendedor",
    "",
    `Este número coincide con la tienda ${nombreComercio}, pero todavía no está vinculado al bot.`,
    "Para activar tu espacio de trabajo, genera tu código en la web y envíamelo por este chat.",
    "",
    "Siguiente paso:",
    "👉 genera el código en la web",
    "👉 pégalo aquí tal como aparece",
  ]);
}

export function buildLinkSuccessMessage(
  nombreComercio: string,
  alreadyLinked = false
): string {
  return lines([
    "🔐 Vinculación lista",
    "",
    alreadyLinked
      ? `Este número ya estaba vinculado con ${nombreComercio}.`
      : `Vinculé este número con ${nombreComercio}.`,
    "",
    "Puedes escribir:",
    `👉 ${UX_COMMANDS.menu}`,
    `👉 ${UX_COMMANDS.products}`,
    `👉 ${UX_COMMANDS.newListing}`,
  ]);
}

export function buildMenuMessage(): string {
  return buildUxResponse("menu");
}

export function buildProfileMessage(data: UxProfileSummary): string {
  return buildUxResponse("profile_summary", {
    store: data.nombreComercio,
    name: data.sellerName,
    phone: data.phoneDisplay || "No configurado",
    count: data.totalProducts,
    activeCount: data.activeProducts,
  });
}

export function buildProductListMessage(products: UxMenuProductItem[]): string {
  if (!products.length) {
    return buildUxResponse("product_list", {
      count: 0,
      isEmpty: true,
    });
  }

  const items = products
    .slice(0, UX_LIST_LIMIT)
    .map(
      (product) =>
        `${product.index}. ${product.nombre} - ${money(product.precio ?? null)}${product.activo == null ? "" : ` - ${product.activo ? "activo" : "inactivo"}`}`
    )
    .join("\n");

  return buildUxResponse("product_list", {
    count: products.length,
    items,
    isEmpty: false,
    hasInactive: products.some((product) => product.activo === false),
    productItems: products.slice(0, UX_LIST_LIMIT),
    supportsActivateCommand: false,
  });
}

export function buildProductViewMessage(
  product: UxProductView,
  options?: {
    actionMode?: "catalog_index" | "focused";
    index?: number | null;
  }
): string {
  const actionMode = options?.actionMode ?? "catalog_index";
  const index = options?.index ?? 1;
  const actions =
    actionMode === "focused"
      ? [
          "👉 editar",
          "👉 eliminar",
          `👉 ${UX_COMMANDS.products}`,
        ]
      : [
          `👉 editar ${index}`,
          `👉 eliminar ${index}`,
          `👉 ${UX_COMMANDS.products}`,
        ];

  return lines([
    "🔎 Detalle del producto",
    "",
    `• Nombre: ${product.nombre}`,
    `• Precio: ${money(product.precio)}`,
    `• Stock: ${product.stock ?? "Pendiente"}`,
    `• Estado: ${product.estado}`,
    `• Categoría: ${product.categoria || "Pendiente"}`,
    `• Clase: ${product.clase || "Pendiente"}`,
    `• Descripción: ${product.descripcion || "Sin descripción"}`,
    "",
    "Puedes escribir:",
    ...actions,
  ]);
}

export function buildEditStartMessage(
  productName: string,
  fields: UxEditModeField[] = [
    { label: "precio" },
    { label: "stock" },
    { label: "descripción" },
    { label: "categoría" },
    { label: "clase" },
  ]
): string {
  return lines([
    `✏️ Estás editando: ${productName}`,
    "",
    "Puedes cambiar:",
    ...fields.map((field) => `👉 ${field.label}`),
    "",
    "Ejemplos:",
    "👉 cambia el precio a Q300",
    "👉 actualiza el stock a 5",
    "👉 agrega que es ideal para uso diario",
    "👉 cambia la categoría a mochila",
    "",
    "Cuando termines:",
    `👉 ${UX_COMMANDS.save}`,
    "",
    "Para salir:",
    `👉 ${UX_COMMANDS.cancel}`,
  ]);
}

export function buildEditFeedbackMessage(field: string, value: string): string {
  return `✅ Actualicé ${field} a ${value}`;
}

export function buildEditFeedbackListMessage(items: UxEditFeedback[]): string {
  if (!items.length) return "";
  const rows = items.slice(0, UX_LIST_LIMIT).map((item) => `✅ ${item.field} actualizado${item.value ? ` a ${item.value}` : ""}`);

  return lines([
    ...rows,
    "",
    "Sigues en modo edición.",
    `👉 ${UX_COMMANDS.save}`,
    `👉 ${UX_COMMANDS.cancel}`,
  ]);
}

export function buildEditSummaryMessage(changes: UxEditSummaryChange[]): string {
  const rows = changes.length
    ? changes.slice(0, UX_LIST_LIMIT).map((change) => `• ${change.field}: ${change.before} → ${change.after}`)
    : ["• Aún no detecto cambios nuevos."];

  return lines([
    "📋 Cambios realizados:",
    "",
    ...rows,
    "",
    "¿Confirmas guardar?",
    "",
    "👉 confirmar",
    `👉 ${UX_COMMANDS.cancel}`,
  ]);
}

export function buildSaveSuccessMessage(productName?: string): string {
  return lines([
    "💾 Cambios guardados",
    "",
    productName ? `Guardé los cambios de "${productName}".` : "Guardé los cambios del producto.",
    "",
    "Puedes seguir con:",
    `👉 ${UX_COMMANDS.products}`,
    `👉 ${UX_COMMANDS.newListing}`,
  ]);
}

export function buildNoEditChangesMessage(): string {
  return lines([
    "ℹ️ No hiciste cambios todavía.",
    "",
    "Puedes modificar algo o escribir:",
    `👉 ${UX_COMMANDS.cancel}`,
  ]);
}

export function buildNoPendingEditConfirmationMessage(): string {
  return lines([
    "ℹ️ No hay cambios pendientes para confirmar.",
    "",
    "Puedes modificar algo, escribir guardar o salir con:",
    `👉 ${UX_COMMANDS.cancel}`,
  ]);
}

export function buildMissingEditTargetMessage(): string {
  return lines([
    "ℹ️ Necesito saber qué producto quieres editar",
    "",
    "Dime la referencia del producto o usa el número de tu lista.",
    "",
    "Ejemplos:",
    "👉 editar 1",
    "👉 editar FJ-BAJ-COR-260326-G4AZ4Z",
    `👉 ${UX_COMMANDS.products}`,
  ]);
}

export function buildCancelMessage(hadActiveFlow = true): string {
  return hadActiveFlow
    ? lines([
        "🛑 Flujo cancelado",
        "",
        "Detuve el proceso actual y limpié el borrador.",
        "",
        "Puedes seguir con:",
        `👉 ${UX_COMMANDS.newListing}`,
        `👉 ${UX_COMMANDS.products}`,
      ])
    : lines([
        "ℹ️ No había nada activo",
        "",
        "No encontré un flujo en curso para cancelar.",
        "",
        "Puedes escribir:",
        `👉 ${UX_COMMANDS.newListing}`,
        `👉 ${UX_COMMANDS.menu}`,
      ]);
}

export function buildResetConversationMessage(context?: {
  hadActiveDraft?: boolean;
  wasEditing?: boolean;
  wasDeleting?: boolean;
}): string {
  return buildUxResponse("reset_success", {
    hadActiveDraft: Boolean(context?.hadActiveDraft),
    wasEditing: Boolean(context?.wasEditing),
    wasDeleting: Boolean(context?.wasDeleting),
    hasActiveDraft: Boolean(
      context?.hadActiveDraft || context?.wasEditing || context?.wasDeleting
    ),
  });
}

export function buildDeleteConfirmMessage(productName: string): string {
  return lines([
    "⚠️ Confirmar desactivación",
    "",
    `Voy a desactivar "${productName}".`,
    "Tu producto no se eliminará para siempre, solo quedará inactivo.",
    "",
    `Para confirmar: 👉 ${UX_COMMANDS.deleteConfirm}`,
    `Para salir: 👉 ${UX_COMMANDS.cancel}`,
  ]);
}

export function buildDeleteSuccessMessage(productName?: string): string {
  return lines([
    "🗂️ Producto desactivado",
    "",
    productName ? `Desactivé "${productName}".` : "Desactivé el producto.",
    "",
    "Puedes seguir con:",
    `👉 ${UX_COMMANDS.products}`,
    `👉 ${UX_COMMANDS.newListing}`,
  ]);
}

export function buildNewListingMessage(): string {
  return lines([
    "🆕 Nueva publicación",
    "",
    "Envíame una imagen, un audio o un texto para empezar.",
    "Si ya tienes foto del producto, envíala primero para avanzar más rápido.",
    "",
    "Ejemplos:",
    "👉 foto del producto",
    "👉 audio describiendo lo que vendes",
    "👉 texto con precio, stock o medidas",
  ]);
}

export function buildErrorMessage(
  type: ConversationUxErrorType,
  context?: { phone?: string | null }
): string {
  switch (type) {
    case "invalid_index":
      return lines([
        "⚠️ No encontré ese número en la lista",
        "",
        "Primero refresca tu catálogo y luego usa el número correcto.",
        "",
        `👉 ${UX_COMMANDS.products}`,
      ]);
    case "expired_context":
      return lines([
        "⌛ Esa lista ya expiró",
        "",
        "Vuelve a pedir tus productos y usa el número otra vez.",
        "",
        `👉 ${UX_COMMANDS.products}`,
      ]);
    case "no_active_edit":
      return lines([
        "ℹ️ No tengo una edición activa",
        "",
        "Primero abre un producto para editarlo.",
        "",
        `👉 ${UX_COMMANDS.products}`,
        "👉 editar 1",
      ]);
    case "no_pending_delete":
      return lines([
        "ℹ️ No tengo una desactivación pendiente",
        "",
        "Primero elige un producto de tu lista.",
        "",
        `👉 ${UX_COMMANDS.products}`,
        "👉 eliminar 1",
      ]);
    case "save_failed":
      return lines([
        "⚠️ No pude guardar los cambios",
        "",
        "Refresca tu lista y vuelve a intentarlo.",
        "",
        `👉 ${UX_COMMANDS.products}`,
      ]);
    case "delete_failed":
      return lines([
        "⚠️ No pude desactivar ese producto",
        "",
        "Refresca tu lista y vuelve a intentarlo.",
        "",
        `👉 ${UX_COMMANDS.products}`,
      ]);
    case "edit_prepare_failed":
      return lines([
        "⚠️ No pude preparar esa edición",
        "",
        "Actualiza tu lista y vuelve a intentarlo.",
        "",
        `👉 ${UX_COMMANDS.products}`,
      ]);
    case "product_access_lost":
      return lines([
        "⚠️ Ya no pude acceder a ese producto",
        "",
        "Actualiza tu lista y vuelve a intentarlo.",
        "",
        `👉 ${UX_COMMANDS.products}`,
      ]);
    case "invalid_link_code":
      return lines([
        "🔐 Código no válido",
        "",
        "Genera un código nuevo en la web y envíamelo tal como aparece.",
      ]);
    case "expired_link_code":
      return lines([
        "⌛ Código vencido",
        "",
        "Ese código ya expiró. Genera uno nuevo en la web y envíamelo otra vez.",
      ]);
    case "phone_already_linked":
      return lines([
        "🔒 Número ya vinculado",
        "",
        "Este número ya está vinculado a otra cuenta de vendedor.",
        "Revoca ese vínculo desde la web antes de intentar enlazarlo aquí.",
      ]);
    case "seller_already_linked_other_phone":
      return lines([
        "🔒 Tu cuenta ya tiene otro número vinculado",
        "",
        context?.phone
          ? `Actualmente está vinculado ${context.phone}.`
          : "Revócalo desde la web antes de vincular este número.",
        "Luego genera un código nuevo y vuelve a intentarlo.",
      ]);
    case "unlinked_phone":
      return buildOnboardingMessage();
    case "audio_not_understood":
      return lines([
        "🎙️ No pude entender el audio",
        "",
        "Puedes enviarlo de nuevo o escribir el mensaje por texto.",
      ]);
    case "unexpected_input":
      return lines([
        "ℹ️ Ese mensaje no coincide con lo que estoy esperando",
        "",
        "Sigue la última instrucción o escribe un comando claro como:",
        `👉 ${UX_COMMANDS.menu}`,
        `👉 ${UX_COMMANDS.cancel}`,
      ]);
    case "generic":
    default:
      return lines([
        "⚠️ Ocurrió un problema",
        "",
        "Intenta nuevamente en un momento.",
        "",
        `👉 ${UX_COMMANDS.menu}`,
      ]);
  }
}
