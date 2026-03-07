// ========================================
// XAZAI - Açai Bar & Smoothies
// Menu Data - Productos Definitivos
// ========================================

const USERS = [
    { email: 'admin@xazai.com', role: 'admin', name: 'Administrador' }
];

const CATEGORIES = {
    inicio: {
        name: 'Nuestro Menú',
        subtitle: 'Açaí bowls, smoothies, jugos y más — todo hecho con amor',
        icon: 'fa-home'
    },
    bowls: {
        name: 'Bowls',
        subtitle: 'Nuestros bowls signature con bases cremosas y toppings frescos',
        icon: 'fa-bowl-food'
    },
    smoothies: {
        name: 'Smoothies',
        subtitle: 'Batidos cremosos con sabores intensos y presentación WOW',
        icon: 'fa-blender'
    },
    jugos: {
        name: 'Jugos',
        subtitle: 'Jugos naturales prensados en frío',
        icon: 'fa-glass-water'
    },
    shots: {
        name: 'Shots',
        subtitle: 'Shots funcionales para tu bienestar',
        icon: 'fa-fire-flame-curved'
    },
    cafe: {
        name: 'Café',
        subtitle: 'Café de grano tostado',
        icon: 'fa-mug-hot'
    },
    bebidas: {
        name: 'Bebidas',
        subtitle: 'Refrescos y agua',
        icon: 'fa-bottle-water'
    },
    extras: {
        name: 'Extras',
        subtitle: 'Toppings y extras adicionales',
        icon: 'fa-plus-circle'
    },
    'arma-tu-bowl': {
        name: 'Arma tu Bowl',
        subtitle: 'Personaliza tu bowl perfecto paso a paso',
        icon: 'fa-wand-magic-sparkles'
    }
};

const MENU_ITEMS = [
    // ==================== BOWLS ====================
    {
        id: 1,
        name: 'The Xazai Bowl',
        category: 'bowls',
        tagline: 'El Original. Donde todo comienza.',
        description: 'Para los que respetan la tradición. Nuestra base pura de Açaí orgánico servida con la combinación de toppings que nunca falla. Equilibrio perfecto y sabor auténtico.',
        ingredients: ['Pulpa de Açaí', 'Banana Congelada', 'Piña Congelada'],
        toppings: ['Granola Artesanal', 'Banana Fresca', 'Fresa Laminada', 'Arándanos', 'Coco Rallado'],
        price: 6.50,
        priceGrande: 10.95,
        image: 'images/xazai-bowl.jpg',
        emoji: '💜',
        badge: 'Clásico',
        onlyGrande: false
    },
    {
        id: 2,
        name: 'Blue Velvet',
        category: 'bowls',
        tagline: 'Antioxidante de color lila intenso',
        description: 'Un bowl de color lila intenso. El protagonista es el sabor silvestre del arándano, usando el banano estrictamente para dar textura cremosa sin opacar el perfil frutal.',
        ingredients: ['Arándanos Congelados', 'Banana Congelada', 'Toque de Limón'],
        toppings: ['Granola', 'Fresas Picadas', 'Rodajas de Banana', 'Coco Rallado'],
        price: 5.95,
        priceGrande: 9.95,
        image: 'images/blue-velvet.jpg',
        emoji: '🫐',
        badge: 'Antioxidante',
        onlyGrande: false
    },
    {
        id: 3,
        name: 'Strawberry Fields',
        category: 'bowls',
        tagline: 'El clásico renovado',
        description: 'Sabor fresa pura y cremosa. Es como comer helado de fruta real. Perfecto para niños y amantes de la fresa.',
        ingredients: ['Fresas Congeladas', 'Banana Congelada'],
        toppings: ['Granola', 'Fresas Frescas', 'Arándanos', 'Coco Rallado'],
        price: 5.95,
        priceGrande: 10.50,
        image: 'images/strawberry-fields.jpg',
        emoji: '🍓',
        badge: 'Favorito',
        onlyGrande: false
    },
    {
        id: 4,
        name: 'Açaí Black Forest',
        category: 'bowls',
        tagline: 'Açaí elevado a perfil de postre',
        description: 'Elevamos el Açaí a un perfil de postre. La acidez de la fruta se encuentra con la intensidad del cacao oscuro en la base. Elegante y adictivo.',
        ingredients: ['Piña Congelada', 'Banana Congelada', 'Açaí', 'Cacao en polvo BOCAO'],
        toppings: ['Granola', 'Fresas Frescas', 'Coco Rallado'],
        price: 6.95,
        priceGrande: 11.95,
        image: 'images/acai-black-forest.jpg',
        emoji: '🍫',
        badge: 'Postre',
        onlyGrande: false
    },
    {
        id: 5,
        name: 'Sunshine Bowl',
        category: 'bowls',
        tagline: 'Tropical Puro',
        description: 'Un bowl amarillo brillante. Refrescante, ácido y dulce. Perfecto para fotos veraniegas y amantes del trópico.',
        ingredients: ['Mango Congelado', 'Piña Congelada', 'Banana', 'Agua de Coco'],
        toppings: ['Granola', 'Cubitos de Piña', 'Fresa Entera', 'Coco Rallado', 'Miel'],
        price: 5.95,
        priceGrande: 9.50,
        image: 'images/sunshine-bowl.jpg',
        emoji: '☀️',
        badge: 'Tropical',
        onlyGrande: false
    },
    {
        id: 6,
        name: 'Xazai Sunset Split',
        category: 'bowls',
        tagline: 'Visual & Contraste — Dos sabores en uno',
        description: 'Dos sabores en uno. El contraste del morado oscuro (Açaí) con el fucsia vibrante (Pitaya) es hipnótico. Dividido 50/50 para una experiencia doble.',
        ingredients: ['Base de Açaí', 'Base de Pitaya'],
        toppings: ['Granola divisoria', 'Cubos de Piña y Mango', 'Arándanos', 'Coco Rallado'],
        price: 7.50,
        priceGrande: 12.50,
        image: 'images/xazai-sunset-split.jpg',
        emoji: '🌅',
        badge: 'Premium',
        onlyGrande: false
    },
    {
        id: 7,
        name: 'Açaí Magic Pop',
        category: 'bowls',
        tagline: 'Experiencia Viral',
        description: 'El bowl diseñado para Instagram y TikTok. No se trata solo del sabor, sino de la sensación de "explosión" en la boca con Peta Zetas y escarcha comestible.',
        ingredients: ['Piña Congelada', 'Banana Congelada', 'Açaí'],
        toppings: ['Granola', 'Cubos de Mango', 'Fresas', 'Escarcha Comestible', 'Peta Zetas'],
        price: 5.95,
        priceGrande: 9.95,
        image: 'images/acai-magic-pop.jpg',
        emoji: '✨',
        badge: 'Viral',
        onlyGrande: false
    },
    {
        id: 8,
        name: 'Xazai Parfait Vertical',
        category: 'bowls',
        tagline: 'Formato para llevar',
        description: 'Ergonomía y capas visibles. Maximiza el uso de la granola como relleno volumétrico crujiente, ideal para comer caminando o llevar a la oficina.',
        ingredients: ['Base Açaí (en capas)', 'Granola (doble capa)'],
        toppings: ['Fruta Picada', 'Coco Rallado'],
        price: 9.95,
        priceGrande: null,
        image: 'images/xazai-parfait-vertical.jpg',
        emoji: '🏗️',
        badge: 'Para Llevar',
        onlyGrande: true
    },
    {
        id: 9,
        name: 'The Fruit Bowl',
        category: 'bowls',
        tagline: 'Frescura cortada al momento',
        description: '100% Fruta fresca, 0% complicaciones. Un mix vibrante de cosecha de temporada picada al instante. Hidratante, ligero y lleno de vitaminas vivas.',
        ingredients: ['Piña Fresca en cubos', 'Sandía en cubos', 'Mango Fresco en cubos'],
        toppings: ['Fresa Fresca entera', 'Miel o Limón opcional'],
        price: 6.00,
        priceGrande: null,
        image: 'images/fruit-bowl.jpg',
        emoji: '🍉',
        badge: 'Fresh Cut',
        onlyGrande: true
    },
    {
        id: 26,
        name: 'The Choco-Gorilla',
        category: 'bowls',
        tagline: 'Energía densa. Cero culpas.',
        description: 'Denso, saciante y con textura de helado. El pre-entreno definitivo para los amantes del cacao. Energía densa y sabor profundo. La combinación clásica de banana, cacao puro y almendras que nunca falla.',
        ingredients: ['Banana Congelada', 'Cacao en polvo', 'Leche de Almendras'],
        toppings: ['Granola Crujiente', 'Banana en Rodajas', 'Mantequilla de Almendras', 'Chispas de Chocolate'],
        price: 5.95,
        priceGrande: 9.50,
        image: 'images/choco-gorilla.jpg',
        emoji: '🍫',
        badge: 'Pre-Entreno',
        onlyGrande: false
    },
    {
        id: 27,
        name: 'The Laila Bowl',
        category: 'bowls',
        tagline: 'Fuchsia Power. Sabor tropical sin filtros.',
        description: 'Vibrante, tropical y súper refrescante. El poder visual de la Pitaya en su máximo esplendor. El bowl más ligero y fotogénico del menú. Perfecto para el clima de Panamá y para quienes buscan un perfil frutal exótico y dulce-ácido.',
        ingredients: ['Pulpa de Pitaya', 'Piña Congelada', 'Banana Congelada', 'Agua de Coco'],
        toppings: ['Granola Crujiente', 'Banana en Rodajas', 'Mango en Cubitos', 'Piña en Cubitos', 'Fresa Laminada', 'Coco Rallado'],
        price: 6.50,
        priceGrande: 10.50,
        image: 'images/laila-bowl.jpg',
        emoji: '🩷',
        badge: 'The Pink Dragon',
        onlyGrande: false
    },

    // ==================== SMOOTHIES ====================
    {
        id: 10,
        name: 'The Royal Açaí',
        category: 'smoothies',
        tagline: 'La Joya de la Corona',
        description: 'Açaí puro en formato bebible y cremoso. Paredes del vaso decoradas con Leche Condensada y granola en el tope.',
        ingredients: ['Açaí 100g', 'Banana Congelada', 'Leche de Almendras'],
        toppings: ['Leche Condensada en paredes', 'Granola en el tope'],
        price: 6.50,
        priceGrande: null,
        image: 'images/royal-acai.jpg',
        emoji: '💜',
        badge: 'Signature',
        onlyGrande: true
    },
    {
        id: 11,
        name: 'Choco-Nut Bomb',
        category: 'smoothies',
        tagline: 'El Goloso',
        description: 'Evolución del batido de chocolate. Más intenso y visual con Nutella licuada dentro y paredes del vaso "sucias" con Nutella.',
        ingredients: ['Cacao en polvo', 'Banana Congelada', 'Leche', 'Nutella'],
        toppings: ['Nutella en paredes', 'Cacao en polvo espolvoreado'],
        price: 7.00,
        priceGrande: null,
        image: 'images/choco-nut-bomb.jpg',
        emoji: '🍫',
        badge: 'Goloso',
        onlyGrande: true
    },
    {
        id: 12,
        name: 'Pink Paradise',
        category: 'smoothies',
        tagline: 'El Fotogénico',
        description: 'Color fucsia eléctrico gracias a la Pitaya. Refrescante con piña tropical y un chorrito de limón que realza el neón del color.',
        ingredients: ['Pitaya Congelada', 'Piña Congelada', 'Agua de Coco', 'Limón'],
        toppings: ['Rodaja de Limón en el borde'],
        price: 6.50,
        priceGrande: null,
        image: 'images/pink-paradise.jpg',
        emoji: '🦩',
        badge: 'Fotogénico',
        onlyGrande: true
    },
    {
        id: 13,
        name: 'Golden Mango',
        category: 'smoothies',
        tagline: 'El Tropical',
        description: 'Amarillo vibrante. Fusión tropical con mango como protagonista, piña y un toque opcional de cúrcuma para potenciar el color dorado.',
        ingredients: ['Mango Congelado', 'Piña', 'Banana', 'Cúrcuma opcional'],
        toppings: ['Leche Condensada en paredes', 'Coco Rallado'],
        price: 6.50,
        priceGrande: null,
        image: 'images/golden-mango.jpg',
        emoji: '☀️',
        badge: 'Tropical',
        onlyGrande: true
    },
    {
        id: 14,
        name: 'Wild Berries',
        category: 'smoothies',
        tagline: 'El Acidito',
        description: 'Color rojo vino intenso. Triple berry con frambuesas, fresas y arándanos. Para los amantes de lo frutal y ácido.',
        ingredients: ['Frambuesas', 'Fresas', 'Arándanos', 'Jugo de Naranja'],
        toppings: ['Fresa entera en el borde'],
        price: 6.50,
        priceGrande: null,
        image: 'images/wild-berries.jpg',
        emoji: '🍇',
        badge: 'Acidito',
        onlyGrande: true
    },
    {
        id: 15,
        name: 'The Muscle Kong',
        category: 'smoothies',
        tagline: 'El Proteico',
        description: 'Para el cliente del Gym. Evolución funcional del batido de banana con proteína y mantequilla de maní. Paredes con PB.',
        ingredients: ['Banana', 'Proteína Sascha', 'Mantequilla de Maní', 'Leche de Almendras'],
        toppings: ['Mantequilla de Maní en paredes'],
        price: 7.00,
        priceGrande: null,
        image: 'images/muscle-kong.jpg',
        emoji: '🦍',
        badge: 'Proteico',
        onlyGrande: true,
        noProtein: true
    },

    // ==================== JUGOS ====================
    {
        id: 16,
        name: 'The Golden Glow',
        category: 'jugos',
        tagline: 'El Escudo — Oro líquido para el cuerpo',
        description: 'Este no es un jugo aburrido, es "oro líquido" para el cuerpo. El color es casi radioactivo de lo intenso. Antioxidante y energizante.',
        ingredients: ['Naranja', 'Zanahoria', 'Jengibre', 'Cúrcuma'],
        toppings: [],
        price: 5.00,
        priceGrande: null,
        image: 'images/golden-glow.jpg',
        emoji: '🛡️',
        badge: 'Escudo',
        onlyGrande: true
    },
    {
        id: 17,
        name: 'The Green Vitality',
        category: 'jugos',
        tagline: 'El Revitalizante',
        description: 'Una explosión de frescura y bienestar en cada sorbo. El pepino hidratante, el apio desintoxicante y el toque dulce-ácido de la manzana verde. Es como un "reset" para tu organismo.',
        ingredients: ['Pepino Fresco', 'Apio', 'Manzana Verde'],
        toppings: [],
        price: 5.00,
        priceGrande: null,
        image: 'images/green-vitality.jpg',
        emoji: '🥒',
        badge: 'Revitalizante',
        onlyGrande: true
    },

    // ==================== SHOTS ====================
    {
        id: 18,
        name: 'The Ginger Fire',
        category: 'shots',
        tagline: 'El clásico que te despierta de golpe',
        description: 'Un golpe directo de jengibre puro prensado en frío con un toque cítrico. Desinflama, acelera el metabolismo y te quita el sueño más rápido que un café.',
        ingredients: ['Jengibre prensado', 'Limón'],
        toppings: [],
        price: 4.00,
        priceGrande: null,
        image: 'images/ginger-fire.jpg',
        emoji: '🔥',
        badge: 'Fuego',
        onlyGrande: true
    },
    {
        id: 19,
        name: 'The Golden Shield',
        category: 'shots',
        tagline: 'El escudo protector — Anti-gripal potente',
        description: 'Oro líquido para tu sistema inmune. La potencia de la cúrcuma activada con pimienta negra, fusionada con jengibre y limón. Antiinflamatorio natural.',
        ingredients: ['Cúrcuma', 'Jengibre', 'Limón', 'Pimienta Negra'],
        toppings: [],
        price: 4.00,
        priceGrande: null,
        image: 'images/golden-shield.jpg',
        emoji: '🛡️',
        badge: 'Escudo',
        onlyGrande: true
    },

    // ==================== CAFÉ ====================
    {
        id: 20,
        name: 'Café Expreso',
        category: 'cafe',
        tagline: 'Grano tostado café expreso',
        description: 'Café expreso de grano tostado. Intenso y aromático.',
        ingredients: ['Grano Tostado'],
        toppings: [],
        price: 3.50,
        priceGrande: null,
        image: 'images/cafe-expreso.jpg',
        emoji: '☕',
        badge: '',
        onlyGrande: true
    },
    {
        id: 21,
        name: 'Café con Leche',
        category: 'cafe',
        tagline: 'Grano tostado café con leche',
        description: 'Café de grano tostado con leche cremosa. El clásico reconfortante.',
        ingredients: ['Grano Tostado', 'Leche'],
        toppings: [],
        price: 4.00,
        priceGrande: null,
        image: 'images/cafe-con-leche.jpg',
        emoji: '☕',
        badge: '',
        onlyGrande: true
    },

    // ==================== BEBIDAS ====================
    {
        id: 22,
        name: 'Coca Cola',
        category: 'bebidas',
        tagline: 'Refresco clásico',
        description: 'Coca Cola clásica bien fría.',
        ingredients: [],
        toppings: [],
        price: 1.85,
        priceGrande: null,
        image: 'images/coca-cola.jpg',
        emoji: '🥤',
        badge: '',
        onlyGrande: true
    },
    {
        id: 23,
        name: 'Coca Cola Zero',
        category: 'bebidas',
        tagline: 'Sin azúcar, mismo sabor',
        description: 'Coca Cola Zero sin azúcar.',
        ingredients: [],
        toppings: [],
        price: 1.85,
        priceGrande: null,
        image: 'images/coca-cola-zero.jpg',
        emoji: '🥤',
        badge: '',
        onlyGrande: true
    },
    {
        id: 24,
        name: 'Canada Dry',
        category: 'bebidas',
        tagline: 'Ginger Ale refrescante',
        description: 'Canada Dry Ginger Ale.',
        ingredients: [],
        toppings: [],
        price: 1.85,
        priceGrande: null,
        image: 'images/canada-dry.jpg',
        emoji: '🥤',
        badge: '',
        onlyGrande: true
    },
    {
        id: 25,
        name: 'Agua',
        category: 'bebidas',
        tagline: 'Agua embotellada',
        description: 'Agua purificada embotellada.',
        ingredients: [],
        toppings: [],
        price: 1.25,
        priceGrande: null,
        image: 'images/agua.jpg',
        emoji: '💧',
        badge: '',
        onlyGrande: true
    }
];

const EXTRA_TOPPINGS = [
    { id: 't1', name: 'Banana Extra', price: 0.50, emoji: '🍌' },
    { id: 't2', name: 'Coco Rallado', price: 0.50, emoji: '🥥' },
    { id: 't3', name: 'Escarcha Comestible', price: 0.50, emoji: '✨' },
    { id: 't4', name: 'Leche Condensada', price: 0.75, emoji: '🥛' },
    { id: 't5', name: 'Miel de Abeja', price: 0.75, emoji: '🍯' },
    { id: 't6', name: 'Mantequilla de Maní', price: 1.00, emoji: '🥜' },
    { id: 't14', name: 'Mantequilla de Almendras', price: 1.00, emoji: '🌰' },
    { id: 't7', name: 'Peta Zetas (Magic Pop)', price: 1.00, emoji: '💥' },
    { id: 't8', name: 'Arándanos', price: 1.25, emoji: '🫐' },
    { id: 't9', name: 'Nutella', price: 1.25, emoji: '🍫' },
    { id: 't10', name: 'Granola Xazai', price: 1.50, emoji: '🥣' },
    { id: 't11', name: 'Fresas Frescas', price: 1.75, emoji: '🍓' },
    { id: 't12', name: 'Proteína (Sascha/Whey)', price: 2.50, emoji: '💪' },
    { id: 't13', name: 'Bola Extra de Açaí', price: 3.00, emoji: '🟣' }
];

// BUILD YOUR OWN BOWL OPTIONS
const BUILD_OPTIONS = {
    bases: [
        { id: 'b1', name: 'Açaí', price: 7.00, emoji: '💜' },
        { id: 'b2', name: 'Pitaya', price: 7.00, emoji: '🩷' },
        { id: 'b3', name: 'Arándanos', price: 7.00, emoji: '🫐' },
        { id: 'b4', name: 'Fresas', price: 7.00, emoji: '🍓' },
        { id: 'b5', name: 'Mango', price: 7.00, emoji: '🥭' },
        { id: 'b6', name: 'Mix Tropical', price: 7.00, emoji: '🌴' }
    ],
    proteins: [
        { id: 'p1', name: 'Banana', price: 1.00, emoji: '🍌' },
        { id: 'p2', name: 'Piña', price: 1.00, emoji: '🍍' },
        { id: 'p3', name: 'Proteína Sascha', price: 2.50, emoji: '💪' },
        { id: 'p4', name: 'Mantequilla de Maní', price: 1.75, emoji: '🥜' }
    ],
    toppings: [
        { id: 'bt1', name: 'Granola', price: 1.50, emoji: '🥣' },
        { id: 'bt2', name: 'Fresas Frescas', price: 1.50, emoji: '🍓' },
        { id: 'bt3', name: 'Banana en Rodajas', price: 1.00, emoji: '🍌' },
        { id: 'bt4', name: 'Arándanos', price: 1.50, emoji: '🫐' },
        { id: 'bt5', name: 'Mango Cubos', price: 1.50, emoji: '🥭' },
        { id: 'bt6', name: 'Piña Cubos', price: 1.00, emoji: '🍍' },
        { id: 'bt7', name: 'Coco Rallado', price: 0.75, emoji: '🥥' },
        { id: 'bt8', name: 'Gotas de Chocolate', price: 1.25, emoji: '🍫' }
    ],
    dressings: [
        { id: 'd1', name: 'Miel', price: 0.50, emoji: '🍯' },
        { id: 'd2', name: 'Leche Condensada', price: 0.75, emoji: '🥛' },
        { id: 'd3', name: 'Nutella', price: 1.00, emoji: '🍫' },
        { id: 'd4', name: 'Mantequilla de Maní', price: 1.00, emoji: '🥜' },
        { id: 'd6', name: 'Mantequilla de Almendras', price: 1.00, emoji: '🌰' },
        { id: 'd5', name: 'Sin Drizzle', price: 0.00, emoji: '✨' }
    ]
};

// Inventory ingredients for stock tracking
const INVENTORY_INGREDIENTS = [
    // Frutas y bases
    { id: 'ing-acai', name: 'Pulpa de Açaí', category: 'Bases', emoji: '💜', unit: 'packs' },
    { id: 'ing-pitaya', name: 'Pitaya Congelada', category: 'Bases', emoji: '🩷', unit: 'packs' },
    { id: 'ing-banana', name: 'Banana', category: 'Frutas', emoji: '🍌', unit: 'unidades' },
    { id: 'ing-fresa', name: 'Fresas', category: 'Frutas', emoji: '🍓', unit: 'lbs' },
    { id: 'ing-arandanos', name: 'Arándanos', category: 'Frutas', emoji: '🫐', unit: 'lbs' },
    { id: 'ing-mango', name: 'Mango', category: 'Frutas', emoji: '🥭', unit: 'lbs' },
    { id: 'ing-pina', name: 'Piña', category: 'Frutas', emoji: '🍍', unit: 'unidades' },
    { id: 'ing-frambuesa', name: 'Frambuesas', category: 'Frutas', emoji: '🍇', unit: 'lbs' },
    // Toppings
    { id: 'ing-granola', name: 'Granola Xazai', category: 'Toppings', emoji: '🥣', unit: 'lbs' },
    { id: 'ing-coco', name: 'Coco Rallado', category: 'Toppings', emoji: '🥥', unit: 'lbs' },
    { id: 'ing-choco', name: 'Gotas de Chocolate', category: 'Toppings', emoji: '🍫', unit: 'lbs' },
    { id: 'ing-escarcha', name: 'Escarcha Comestible', category: 'Toppings', emoji: '✨', unit: 'packs' },
    { id: 'ing-petazeta', name: 'Peta Zetas', category: 'Toppings', emoji: '💥', unit: 'packs' },
    // Salsas y cremas
    { id: 'ing-nutella', name: 'Nutella', category: 'Salsas', emoji: '🍫', unit: 'jars' },
    { id: 'ing-miel', name: 'Miel de Abeja', category: 'Salsas', emoji: '🍯', unit: 'botellas' },
    { id: 'ing-lechec', name: 'Leche Condensada', category: 'Salsas', emoji: '🥛', unit: 'latas' },
    { id: 'ing-pb', name: 'Mantequilla de Maní', category: 'Salsas', emoji: '🥜', unit: 'jars' },
    // Proteína y suplementos
    { id: 'ing-proteina', name: 'Proteína Sascha', category: 'Suplementos', emoji: '💪', unit: 'scoops' },
    { id: 'ing-curcuma', name: 'Cúrcuma', category: 'Suplementos', emoji: '🟡', unit: 'grams' },
    { id: 'ing-jengibre', name: 'Jengibre', category: 'Suplementos', emoji: '🫚', unit: 'unidades' },
    // Leches
    { id: 'ing-leche', name: 'Leche Entera', category: 'Leches', emoji: '🥛', unit: 'litros' },
    { id: 'ing-leche-alm', name: 'Leche de Almendras', category: 'Leches', emoji: '🌰', unit: 'litros' },
    { id: 'ing-agua-coco', name: 'Agua de Coco', category: 'Leches', emoji: '🥥', unit: 'litros' },
    // Bebidas (stock por unidad)
    { id: 'ing-coca', name: 'Coca Cola', category: 'Bebidas', emoji: '🥤', unit: 'unidades' },
    { id: 'ing-coca-zero', name: 'Coca Cola Zero', category: 'Bebidas', emoji: '🥤', unit: 'unidades' },
    { id: 'ing-canada', name: 'Canada Dry', category: 'Bebidas', emoji: '🥤', unit: 'unidades' },
    { id: 'ing-agua', name: 'Agua', category: 'Bebidas', emoji: '💧', unit: 'unidades' },
    // Café
    { id: 'ing-cafe', name: 'Café en Grano', category: 'Café', emoji: '☕', unit: 'lbs' },
    { id: 'ing-vasos', name: 'Vasos', category: 'Insumos', emoji: '🥤', unit: 'unidades' },
    { id: 'ing-tapas', name: 'Tapas de Vaso', category: 'Insumos', emoji: '🔵', unit: 'unidades' },
    { id: 'ing-cucharas', name: 'Cucharas Bowl', category: 'Insumos', emoji: '🥄', unit: 'unidades' }
];
