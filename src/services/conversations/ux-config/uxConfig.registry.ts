import { UX_COMMANDS } from "../ux/conversationUxTemplates";
import {
  buildDetailActions,
  buildEditActions,
  buildProductActions,
} from "./uxActionBuilders.service";
import type { UxTemplateConfig, UxTemplateKey } from "./uxConfig.types";

export const uxRegistry: Record<UxTemplateKey, UxTemplateConfig> = {
  menu: {
    mode: "actionable",
    title: "📍 Menú de vendedor",
    body: ["Usa uno de estos comandos:"],
    actions: [
      UX_COMMANDS.profile,
      UX_COMMANDS.products,
      UX_COMMANDS.newListing,
      UX_COMMANDS.cancel,
      "",
      "ver 1",
      "editar 2",
      "eliminar 3",
    ],
  },
  profile_summary: {
    mode: "informative",
    title: "👤 Tu perfil",
    body: [
      "• Comercio: {store}",
      "• Nombre: {name}",
      "• WhatsApp vinculado: {phone}",
      "• Productos: {count}",
      "• Activos: {activeCount}",
    ],
    actions: [UX_COMMANDS.products, UX_COMMANDS.newListing],
  },
  product_list: {
    mode: "actionable",
    title: (ctx) =>
      Number(ctx.count ?? 0) === 0
        ? "🧵 Tus productos"
        : `🧵 Tus productos (${ctx.count})`,
    body: (ctx) =>
      ctx.isEmpty
        ? []
        : [String(ctx.items ?? "")],
    actions: (ctx) => {
      if (ctx.isEmpty) {
        return [UX_COMMANDS.newListing];
      }

      return buildProductActions(ctx.productItems ?? [], {
        includeActivateCommand: Boolean(ctx.supportsActivateCommand),
      });
    },
    emptyWhen: ["isEmpty"],
    emptyState: [
      "Aún no tienes productos.",
      "",
      "Siguiente paso:",
      `👉 ${UX_COMMANDS.newListing}`,
    ],
    sections: [
      {
        showWhen: (ctx) => Boolean(ctx.hasInactive),
        lines: [
          "ℹ️ Tienes productos inactivos en esta lista.",
        ],
      },
    ],
  },
  product_detail: {
    mode: "actionable",
    title: "🔎 Detalle del producto",
    body: [
      "• Nombre: {name}",
      "• Precio: {price}",
      "• Stock: {stock}",
      "• Estado: {status}",
      "• Categoría: {category}",
      "• Clase: {productClass}",
      "• Descripción: {description}",
    ],
    actions: (ctx) =>
      buildDetailActions(
        ctx.product as any,
        {
          includeActivateCommand: Boolean(ctx.supportsActivateCommand),
        }
      ),
    variants: ["default"],
  },
  edit_start: {
    mode: "actionable",
    title: "✏️ Modo edición",
    body: [
      'Estoy editando "{name}".',
      "Puedes enviar cambios en texto, audio o imagen.",
      "",
      "Ejemplos:",
      "👉 cambia el precio a Q300",
      "👉 agrega que es ideal para uso diario",
      "👉 cambia la categoría a mochila",
    ],
    actions: (ctx) => buildEditActions(ctx),
  },
  delete_confirm: {
    mode: "confirmation",
    title: "⚠️ Confirmar desactivación",
    body: [
      'Voy a desactivar "{name}".',
      "Tu producto no se eliminará para siempre, solo quedará inactivo.",
    ],
    actions: [UX_COMMANDS.deleteConfirm, UX_COMMANDS.cancel],
  },
  reset_success: {
    mode: "actionable",
    title: (ctx) => {
      if (ctx.hadActiveDraft || ctx.wasEditing || ctx.wasDeleting) {
        return ctx.variant === "direct"
          ? "🔄 Reinicio completado"
          : "🔄 Listo, empezamos de nuevo";
      }

      return ctx.variant === "direct"
        ? "🔄 Reinicio completado"
        : "🔄 Ya reinicié todo";
    },
    body: (ctx) => {
      if (ctx.wasEditing) {
        return [
          "Cancelé la edición que estabas haciendo.",
          "Ahora estás de vuelta al inicio.",
        ];
      }

      if (ctx.wasDeleting) {
        return [
          "Cancelé la desactivación pendiente que tenías abierta.",
          "Ahora estás de vuelta al inicio.",
        ];
      }

      if (ctx.hadActiveDraft) {
        return [
          "Cancelé la publicación que estabas creando.",
          "Ahora estás de vuelta al inicio.",
        ];
      }

      return [
        "No dejé ningún proceso activo pendiente.",
        "Puedes empezar otra vez cuando quieras.",
      ];
    },
    actions: () => [
      'crear un producto -> escribe "nuevo"',
      'ver tus productos -> escribe "mis productos"',
      'ver tu perfil -> escribe "perfil"',
    ],
    variants: ["warm", "direct"],
  },
  error_invalid_index: {
    mode: "error",
    title: "⚠️ No encontré ese número en la lista",
    body: ["Primero refresca tu catálogo y luego usa el número correcto."],
    actions: [UX_COMMANDS.products],
  },
  error_expired_context: {
    mode: "error",
    title: "⌛ Esa lista ya expiró",
    body: ["Vuelve a pedir tus productos y usa el número otra vez."],
    actions: [UX_COMMANDS.products],
  },
};
