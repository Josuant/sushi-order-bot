/**
 * Catálogo de Productos, Recetas y Modificadores - Ecosistema Sushi Erizo
 * Incluye ingredientes con cantidades y pasos de preparación estilo KDS
 */
export const MENU_DATA = {
  categories: [
    {
      id: "rolls_especiales",
      title: "🍣 Rollos Especiales",
      description: "Nuestras creaciones insignia con mariscos frescos y toppings artesanales"
    },
    {
      id: "makis_clasicos",
      title: "🥢 Makis Clásicos",
      description: "Tradición japonesa con el balance perfecto de sabor"
    },
    {
      id: "nigiris_sashimi",
      title: "🍱 Nigiris & Sashimi",
      description: "Cortes premium de salmón, atún toro y erizo fresco"
    },
    {
      id: "entradas",
      title: "🥟 Entradas & Kushiages",
      description: "Edamames, gyozas artesanales y brochetas crujientes"
    },
    {
      id: "bebidas",
      title: "🍹 Bebidas & Mocktails",
      description: "Calpis, Ramune japonés y tés matcha infusionados"
    }
  ],
  items: [
    {
      id: "erizo_supreme_roll",
      categoryId: "rolls_especiales",
      name: "Erizo Supreme Roll (10 pzas)",
      price: 245,
      prepMins: 9,
      description: "Camarón tempura, aguacate y pepino por dentro. Coronado con erizo de mar fresco, salsa tare y ajonjolí negro.",
      allergens: ["Mariscos", "Sésamo", "Gluten"],
      badge: "⭐ Insignia",
      image: "🍣",
      recipeIngredients: [
        { name: "Arroz sumeshi", amount: "130 g" },
        { name: "Hoja de nori", amount: "1 hoja" },
        { name: "Camarón tempura", amount: "2 pzas (60 g)" },
        { name: "Aguacate Hass", amount: "40 g" },
        { name: "Pepino", amount: "30 g" },
        { name: "Erizo de mar fresco", amount: "45 g" },
        { name: "Salsa Tare artesanal", amount: "15 ml" },
        { name: "Ajonjolí negro tostado", amount: "5 g" }
      ],
      steps: [
        { step: 1, instruction: "Extender 130g de arroz sumeshi sobre la hoja de nori con manos húmedas." },
        { step: 2, instruction: "Colocar camarón tempura crujiente, aguacate y pepino en el centro." },
        { step: 3, instruction: "Enrollar con esterilla makisu aplicando presión uniforme." },
        { step: 4, instruction: "Coronar cada bocado con erizo fresco seleccionado." },
        { step: 5, instruction: "Glasear con salsa tare y espolvorear ajonjolí negro. Cortar en 10 piezas." }
      ]
    },
    {
      id: "volcano_salmon_roll",
      categoryId: "rolls_especiales",
      name: "Volcano Salmón Flambeado (10 pzas)",
      price: 220,
      prepMins: 8,
      description: "Queso crema, pepino y espárragos. Forrado de salmón fresco flambeado al soplete con spicy mayo y masago.",
      allergens: ["Pescado", "Lácteos", "Huevo"],
      badge: "🔥 Más Pedido",
      image: "🔥",
      recipeIngredients: [
        { name: "Arroz sumeshi", amount: "120 g" },
        { name: "Hoja de nori", amount: "1 hoja" },
        { name: "Queso crema", amount: "40 g" },
        { name: "Pepino", amount: "30 g" },
        { name: "Espárrago tierno", amount: "2 pzas" },
        { name: "Salmón noruego fresco", amount: "70 g" },
        { name: "Spicy mayo", amount: "20 ml" },
        { name: "Masago", amount: "10 g" }
      ],
      steps: [
        { step: 1, instruction: "Extender arroz sobre nori y colocar queso crema, pepino y espárragos." },
        { step: 2, instruction: "Cerrar el rollo con esterilla firme." },
        { step: 3, instruction: "Cubrir el exterior con láminas de salmón fresco." },
        { step: 4, instruction: "Flambear con soplete a fuego medio hasta dorar los aceites naturales." },
        { step: 5, instruction: "Bañar con spicy mayo, masago y cortar en 10 piezas limpias." }
      ]
    },
    {
      id: "dragon_black_roll",
      categoryId: "rolls_especiales",
      name: "Dragon Black Roll (10 pzas)",
      price: 235,
      prepMins: 10,
      description: "Cangrejo suave frito y queso crema. Cubierto de aguacate cremoso, láminas de anguila glaseada y salsa dulce.",
      allergens: ["Crustáceos", "Pescado", "Lácteos", "Gluten"],
      badge: "👑 Premium",
      image: "🐉",
      recipeIngredients: [
        { name: "Arroz sumeshi", amount: "130 g" },
        { name: "Hoja de nori", amount: "1 hoja" },
        { name: "Cangrejo suave frito", amount: "65 g" },
        { name: "Queso crema", amount: "35 g" },
        { name: "Aguacate Hass", amount: "50 g" },
        { name: "Anguila unagi glaseada", amount: "40 g" },
        { name: "Salsa dulce de anguila", amount: "15 ml" }
      ],
      steps: [
        { step: 1, instruction: "Distribuir arroz sumeshi y rellenar con cangrejo suave y queso crema." },
        { step: 2, instruction: "Enrollar y montar láminas delgadas de aguacate y anguila unagi encima." },
        { step: 3, instruction: "Fijar con plástico film y esterilla para moldear el lomo de dragón." },
        { step: 4, instruction: "Cortar en 10 piezas y aplicar hilo de salsa dulce." }
      ]
    },
    {
      id: "spicy_tuna_crunch",
      categoryId: "makis_clasicos",
      name: "Spicy Tuna Crunch (8 pzas)",
      price: 185,
      prepMins: 7,
      description: "Atún aleta amarilla marinado en sriracha y aceite de ajonjolí, con pepino fresco y cebollín crujiente.",
      allergens: ["Pescado", "Sésamo", "Gluten"],
      badge: "🌶️ Picante",
      image: "🐟",
      recipeIngredients: [
        { name: "Arroz sumeshi", amount: "120 g" },
        { name: "Hoja de nori", amount: "1 hoja" },
        { name: "Atún aleta amarilla", amount: "60 g" },
        { name: "Pepino", amount: "30 g" },
        { name: "Salsa sriracha & sésamo", amount: "15 ml" },
        { name: "Cebollín fresco", amount: "5 g" },
        { name: "Panko crujiente", amount: "15 g" }
      ],
      steps: [
        { step: 1, instruction: "Picar el atún fino y macerar con sriracha y aceite de ajonjolí." },
        { step: 2, instruction: "Extender sobre nori, colocar relleno de atún, pepino y panko." },
        { step: 3, instruction: "Enrollar con presión media y cortar en 8 piezas." }
      ]
    },
    {
      id: "philadelphia_especial",
      categoryId: "makis_clasicos",
      name: "Philly Especial de Salmón (8 pzas)",
      price: 175,
      prepMins: 6,
      description: "Salmón noruego, abundante queso crema y aguacate hass, cubierto con ajonjolí blanco tostado.",
      allergens: ["Pescado", "Lácteos", "Sésamo"],
      badge: "Clásico",
      image: "🥑",
      recipeIngredients: [
        { name: "Arroz sumeshi", amount: "120 g" },
        { name: "Hoja de nori", amount: "1 hoja" },
        { name: "Salmón fresco", amount: "50 g" },
        { name: "Queso crema Philadelphia", amount: "50 g" },
        { name: "Aguacate Hass", amount: "35 g" },
        { name: "Ajonjolí blanco tostado", amount: "5 g" }
      ],
      steps: [
        { step: 1, instruction: "Extender arroz sobre nori y espolvorear ajonjolí (uramaki)." },
        { step: 2, instruction: "Voltear y rellenar con salmón, queso crema y aguacate." },
        { step: 3, instruction: "Cerrar con esterilla y cortar en 8 porciones." }
      ]
    },
    {
      id: "gyozas_cerdo_trufa",
      categoryId: "entradas",
      name: "Gyozas de Cerdo & Trufa (5 pzas)",
      price: 145,
      prepMins: 5,
      description: "Empanaditas japonesas al vapor y selladas a la plancha con salsa ponzu cítrica.",
      allergens: ["Gluten", "Soya"],
      badge: "Popular",
      image: "🥟",
      recipeIngredients: [
        { name: "Gyozas artesanales", amount: "5 pzas" },
        { name: "Aceite de trufa blanca", amount: "5 ml" },
        { name: "Salsa Ponzu cítrica", amount: "30 ml" },
        { name: "Cebollín picado", amount: "5 g" }
      ],
      steps: [
        { step: 1, instruction: "Sellar las gyozas en teppan caliente hasta dorar la base." },
        { step: 2, instruction: "Añadir toque de vapor tapado por 3 minutos." },
        { step: 3, instruction: "Servir con gotas de trufa y dip de ponzu." }
      ]
    }
  ],
  customizationOptions: {
    exclusions: [
      { id: "sin_pepino", label: "Sin pepino", tag: "SIN PEPINO", isCritical: true },
      { id: "sin_ajonjoli", label: "Sin ajonjolí (Sésamo)", tag: "SIN AJONJOLÍ", isCritical: true },
      { id: "sin_queso", label: "Sin queso crema", tag: "SIN QUESO CREMA", isCritical: true },
      { id: "sin_aguacate", label: "Sin aguacate", tag: "SIN AGUACATE", isCritical: false },
      { id: "sin_spicy", label: "Sin picante / sriracha", tag: "SIN SPICY", isCritical: false },
      { id: "alergia_mariscos", label: "⚠️ ALERGIA: Cero mariscos", tag: "ALERGIA A MARISCOS", isCritical: true },
      { id: "alergia_gluten", label: "⚠️ ALERGIA: Cero gluten / sin panko", tag: "ALERGIA A GLUTEN", isCritical: true }
    ],
    extras: [
      { id: "extra_queso", label: "Extra Queso Crema", price: 25, tag: "EXTRA QUESO CREMA" },
      { id: "extra_aguacate", label: "Extra Aguacate Hass", price: 30, tag: "EXTRA AGUACATE" },
      { id: "extra_anguila", label: "Extra Anguila Glaseada", price: 55, tag: "EXTRA ANGUILA" },
      { id: "extra_spicy_mayo", label: "Extra Porción Spicy Mayo", price: 15, tag: "EXTRA SPICY MAYO" },
      { id: "extra_erizo", label: "Topping Extra Erizo Fresco", price: 80, tag: "EXTRA ERIZO" },
      { id: "panko_crujiente", label: "Empanizado Crujiente Panko", price: 20, tag: "EXTRA PANKO" }
    ]
  }
};
