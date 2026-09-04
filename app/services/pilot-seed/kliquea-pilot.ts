import type { PilotQuestionnaireDefinition } from "../shop/settings";

export const KLIQUEA_PILOT_PACK_ID = "kliquea-pilot" as const;

/**
 * Logical Kliquea pilot questionnaire from SEGMENTIVA_MVP_BUILD_PLAN.md section 6.
 * This is merchant configuration, not a store domain or credential.
 * Phase 2 persists these keys as Questionnaire/Question/Option rows.
 */
export const kliqueaPilotQuestionnaire: PilotQuestionnaireDefinition = {
  packId: KLIQUEA_PILOT_PACK_ID,
  defaultLocale: "en",
  title: {
    en: "Tell us how you like to shop",
    es: "Cuéntanos cómo te gusta comprar",
  },
  introduction: {
    en: "A few short questions help us personalize your shopping experience. This is not email or SMS marketing consent.",
    es: "Unas preguntas breves nos ayudan a personalizar tu experiencia de compra. Esto no es consentimiento de marketing por email o SMS.",
  },
  completionMessage: {
    en: "Thanks. Your preferences are saved and you can update them anytime from your account.",
    es: "Gracias. Tus preferencias están guardadas y puedes actualizarlas cuando quieras desde tu cuenta.",
  },
  privacyExplanation: {
    en: "We store your answers as app-owned preferences in Shopify so this store can personalize shopping. We do not use this form as marketing opt-in.",
    es: "Guardamos tus respuestas como preferencias de la app en Shopify para que esta tienda pueda personalizar la compra. Este formulario no es un alta de marketing.",
  },
  questions: [
    {
      key: "interests",
      type: "multi_select",
      required: true,
      position: 1,
      label: {
        en: "What are you interested in?",
        es: "¿Qué te interesa?",
      },
      options: [
        { key: "beauty", label: { en: "Beauty", es: "Belleza" } },
        {
          key: "womens_fashion",
          label: { en: "Women's fashion", es: "Moda de mujer" },
        },
        {
          key: "mens_fashion",
          label: { en: "Men's fashion", es: "Moda de hombre" },
        },
        { key: "kids", label: { en: "Kids", es: "Niños" } },
        { key: "home", label: { en: "Home", es: "Hogar" } },
        { key: "technology", label: { en: "Technology", es: "Tecnología" } },
        {
          key: "health_and_wellness",
          label: { en: "Health and wellness", es: "Salud y bienestar" },
        },
        { key: "sports", label: { en: "Sports", es: "Deportes" } },
      ],
    },
    {
      key: "shopping_for",
      type: "multi_select",
      required: false,
      position: 2,
      label: {
        en: "Who do you usually shop for?",
        es: "¿Para quién sueles comprar?",
      },
      options: [
        { key: "myself", label: { en: "Myself", es: "Para mí" } },
        { key: "partner", label: { en: "My partner", es: "Mi pareja" } },
        {
          key: "children_or_family",
          label: { en: "Children or family", es: "Hijos o familia" },
        },
        { key: "gifts", label: { en: "Gifts", es: "Regalos" } },
        { key: "business", label: { en: "My business", es: "Mi negocio" } },
      ],
    },
    {
      key: "shopping_style",
      type: "single_select",
      required: false,
      position: 3,
      label: {
        en: "What best describes how you shop?",
        es: "¿Qué describe mejor cómo compras?",
      },
      options: [
        {
          key: "deals",
          label: { en: "I look for deals", es: "Busco ofertas" },
        },
        {
          key: "price_quality_balance",
          label: {
            en: "I balance price and quality",
            es: "Equilibro precio y calidad",
          },
        },
        {
          key: "premium",
          label: {
            en: "I prefer premium products",
            es: "Prefiero productos premium",
          },
        },
        {
          key: "depends",
          label: {
            en: "It depends on the purchase",
            es: "Depende de la compra",
          },
        },
      ],
    },
  ],
};
