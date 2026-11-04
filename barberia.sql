-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 31-03-2026 a las 17:56:04
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `barberia`
--
CREATE DATABASE IF NOT EXISTS `barberia` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `barberia`;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `barbas`
--

DROP TABLE IF EXISTS `barbas`;
CREATE TABLE `barbas` (
  `id` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `precio` decimal(10,2) DEFAULT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `destacado` tinyint(1) DEFAULT 0,
  `barba_principal_id` int(11) DEFAULT NULL,
  `rol` enum('Principal','Relacionado') DEFAULT NULL,
  `descripcion_principal` text DEFAULT NULL,
  `imagen_destacado` varchar(255) DEFAULT NULL,
  `descripcion_destacado` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `barbas`
--

INSERT INTO `barbas` (`id`, `nombre`, `descripcion`, `precio`, `imagen`, `destacado`, `barba_principal_id`, `rol`, `descripcion_principal`, `imagen_destacado`, `descripcion_destacado`) VALUES
(1, 'Fade Barb', 'El \"fade\" en la barba es un estilo de degradado progresivo del vello facial, que va de más largo en la parte superior de la barbilla y mandíbula a más corto (incluso rapado) en las patillas y el cuello. Este estilo se caracteriza por una transición suave y difuminada, que crea un acabado limpio, moderno y pulido. La barba degradada ayuda a definir los rasgos faciales y puede adaptarse a la forma de la cara y al estilo de vello de cada persona. ', 15500.00, '/uploads/1760746495121-Fade Bear Black.png', 1, NULL, 'Principal', 'Atrévete a cambiar de estilo', '/uploads/1760747985657-FADE BARB.jpg', 'Impresionantes Barbas'),
(2, 'Anchor beard', 'La barba de ancla es un estilo de barba que imita la forma de un ancla de barco, caracterizado por una perilla de punta fina conectada a un bigote que se extiende a lo largo de la línea de la mandíbula, sin patillas ni mejillas. Este estilo es una combinación de una barba de chivo, un bigote y una línea de mandíbula perfilada, y es ideal para caras cuadradas u oblongas. ', 15500.00, '/uploads/1760746988446-Anchor bread black.png', 0, 1, 'Relacionado', NULL, NULL, NULL),
(3, 'balbo beard', 'La barba Balbo es un estilo de barba sin patillas que combina un bigote separado de una barba en la barbilla. Se caracteriza por tener un bigote bien definido, una barba en el mentón que no se conecta al bigote, y las patillas completamente afeitadas. Este estilo es elegante, pulcro y se ha popularizado en parte por su uso en la cultura popular. ', 15500.00, '/uploads/1760747017742-balbo barba iron man.png', 0, 1, 'Relacionado', NULL, NULL, NULL),
(4, 'Full Goatee', 'Una barba \"full goatee\" es una barba de chivo que incluye un bigote y el vello de la barbilla unidos, formando una barba circular o en forma de \"candado\". Este estilo define el centro de la cara y puede tener una longitud y frondosidad considerables, abarcando la barbilla, el alma (el vello justo debajo del labio inferior) y el bigote, que se extienden alrededor de los labios y conectan entre sí. ', 15500.00, '/uploads/1760747265806-Full Goatee.png', 0, 6, 'Relacionado', NULL, NULL, NULL),
(5, 'anchor goatee', 'La barba de ancla es un estilo que combina un bigote con una perilla en punta a lo largo de la mandíbula, sin patillas, con el objetivo de crear una forma que recuerde al ancla de un barco. Para lograr este look, se afeitan las mejillas y el cuello, se da forma a la línea de la mandíbula y el bigote para crear una figura distintiva. ', 15500.00, '/uploads/1760747178574-Anchor Goatee.png', 0, 6, 'Relacionado', NULL, NULL, NULL),
(6, 'Goatee', 'Una barba goatee es un estilo de vello facial que se enfoca en el mentón, similar a la barba de una cabra, y se llama en español \"perilla\" o \"barba de chivo\". No se extiende a las mejillas ni a la mandíbula como una barba completa, aunque puede conectarse con un bigote en algunas variaciones, como la perilla completa o el estilo Van Dyke. Existen muchos estilos, desde una pequeña barba puntiaguda hasta opciones más complejas. ', 15500.00, '/uploads/1760747129598-Goatee.png', 0, NULL, 'Principal', 'Elegante y de clase', NULL, NULL),
(7, 'the viking beard', 'La barba vikinga se describe como larga, tupida y bien desarrollada, con un bigote abundante que se une a la barba. Históricamente, también se decoraba con cuentas o adornos y a menudo se trenzaba para mantenerla controlada y con un estilo distintivo. La barba completa, que llega hasta el cuello, es un estilo icónico. ', 15500.00, '/uploads/1760747054664-The Viking Beard.png', 0, 1, 'Relacionado', NULL, NULL, NULL),
(8, 'van dyke beard', 'Una barba Van Dyke es un estilo de vello facial que combina un bigote y una perilla (o barba de chivo) separada, con las mejillas completamente afeitadas. Recibe su nombre del pintor flamenco del siglo XVII Anthony van Dyck y se caracteriza por tener una barba puntiaguda en el mentón y un bigote que no se conectan entre sí. Es un estilo que puede estilizar el rostro alargando las facciones, especialmente en rostros triangulares. ', 15500.00, '/uploads/1760747085078-van dyke beard.png', 0, 1, 'Relacionado', NULL, NULL, NULL),
(9, 'Circle Beard ', 'La barba circular, también conocida como perilla y bigote, es un estilo que combina un bigote con una perilla redondeada que rodea la boca y la barbilla, creando una forma circular. Es fácil de mantener y se caracteriza por ser un estilo más ordenado que una barba completa, ideal para hombres que buscan una apariencia pulida y elegante. ', 15500.00, '/uploads/1760747215413-Circle Beard.png', 0, 6, 'Relacionado', NULL, NULL, NULL),
(10, 'Classic Goatee', 'Una perilla o \"goatee\" clásica es un estilo de barba que se concentra en el vello de la barbilla y el área del \"soul patch\" (justo debajo del labio inferior), mientras se afeita el resto del rostro, incluyendo los bigotes. Es un look atemporal y versátil que se puede mantener sencillo o convertirse en la base para variaciones más complejas, añadiendo un toque de sofisticación o individualidad. ', 15500.00, '/uploads/1760747299176-Clasic Goatee.png', 0, 6, 'Relacionado', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `barberos`
--

DROP TABLE IF EXISTS `barberos`;
CREATE TABLE `barberos` (
  `id` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `tipo` enum('Peluquero','Barbero','Ambos') NOT NULL,
  `descripcion` text DEFAULT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  `corte1_id` int(11) DEFAULT NULL,
  `corte2_id` int(11) DEFAULT NULL,
  `corte3_id` int(11) DEFAULT NULL,
  `corte4_id` int(11) DEFAULT NULL,
  `barba1_id` int(11) DEFAULT NULL,
  `barba2_id` int(11) DEFAULT NULL,
  `barba3_id` int(11) DEFAULT NULL,
  `barba4_id` int(11) DEFAULT NULL,
  `horario_manana` varchar(100) DEFAULT NULL,
  `horario_tarde` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

--
-- Volcado de datos para la tabla `barberos`
--

INSERT INTO `barberos` (`id`, `nombre`, `tipo`, `descripcion`, `imagen`, `corte1_id`, `corte2_id`, `corte3_id`, `corte4_id`, `barba1_id`, `barba2_id`, `barba3_id`, `barba4_id`, `horario_manana`, `horario_tarde`, `created_at`) VALUES
(1, 'Chino Moreno', 'Peluquero', 'Camilo Wong Moreno, más conocido como Chino Moreno, es un músico estadounidense de ascendencia mexicana y china. Es el cantante y, ocasionalmente, guitarrista de la banda de metal alternativo Deftones; pero eso no rendia y ahora se puso a cortar pelo de manera bien insana por que la musica ya no daba pa\' mas; no trabaja de noche por que está preparando el nuevo disco de deftones que pronto lo sacara de la inmunda', '/uploads/1760826029326-Chinito.png', 1, 3, 9, 6, NULL, NULL, NULL, NULL, '4:00 AM - 9:00 AM', NULL, '2025-10-18 22:20:29'),
(2, 'A$AP ROCKY', 'Barbero', 'Rakim Athelston Mayers (Harlem, Nueva York; 3 de octubre de 1988), más conocido por su nombre artístico A$AP Rocky, es un rapero, cantante, modelo, productor, actor y director estadounidense, miembro del grupo de hip hop A$AP Mob, del cual adaptó su apodo. Tuvo que dejar esa vida pa\' ponerse a cortar barbas, es racista que un negro corte barbas; tal vez, pero eso no quita que hace unos discos bien duros, pero como se demoró pa\' saca el ulimo ya la gente no le para bola y le toco empezar a tirar pala de velda velda. El si trabaja de noche por que es cule flojo pa sacar musica y tienes que sacar adelante a los 20 pelaos que le embarco a Rihanna', '/uploads/1760826855328-ASAP.png', NULL, NULL, NULL, NULL, 1, 5, 9, 7, '4:00 AM - 9:00 AM', '2:00  PM - 9:00 PM', '2025-10-18 22:32:57'),
(3, 'Juanito Pei Segundo ', 'Peluquero', 'Por fin un Peluquero de verdad el es Juanito Pei Segundo Peluquero profesional y estilista apasionado por crear looks únicos. Especialista en cortes modernos, técnicas de color y cuidado capilar. Mi misión es resaltar tu estilo y confianza a través de un servicio de alta calidad. ¡Agenda tu cita y transforma tu imagen! Mi loco este diablo trabaja todo el dia', '/uploads/1760827299699-Balbero.png', 3, 8, 9, 10, NULL, NULL, NULL, NULL, '9:00 AM -  12:00 PM', '1:00 PM - 9:00 PM', '2025-10-18 22:41:39'),
(4, 'Mark Coantonio Solis', 'Ambos', 'Diablo barbero y peluquero encima negro, lo ma duro del sistema, con este man quedaras bien acicalado pa las viejas de cantaclaro con más de 1250 años de experiencia en el arte de la peluquería, me dedico a ofrecer una experiencia personalizada y de primer nivel. Mi filosofía se centra en escuchar las necesidades de cada cliente para crear un estilo que no solo se vea increíble, sino que también refleje su personalidad y sea fácil de mantener; repito Lo ma duro del sistema pareciera que viviera en el local', '/uploads/1760827497142-Black Barber.png', 2, 1, 4, 3, 1, 4, 10, 9, '2:00AM - 12:00 PM', '12:02 PM - 1:58 PM', '2025-10-18 22:44:57');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cortes`
--

DROP TABLE IF EXISTS `cortes`;
CREATE TABLE `cortes` (
  `id` int(11) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `precio` decimal(10,2) DEFAULT NULL,
  `imagen` varchar(255) NOT NULL,
  `imagen_destacado` varchar(255) DEFAULT NULL,
  `destacado` tinyint(1) DEFAULT 0,
  `corte_principal_id` int(11) DEFAULT NULL,
  `rol` varchar(50) DEFAULT NULL,
  `descripcion_principal` text DEFAULT NULL,
  `descripcion_destacado` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

--
-- Volcado de datos para la tabla `cortes`
--

INSERT INTO `cortes` (`id`, `nombre`, `descripcion`, `precio`, `imagen`, `imagen_destacado`, `destacado`, `corte_principal_id`, `rol`, `descripcion_principal`, `descripcion_destacado`) VALUES
(1, 'Low Taper Fade', 'El low taper fade es un corte de cabello que se caracteriza por un degradado muy bajo y gradual en los lados y la nuca, que comienza justo por encima de las orejas y la línea del cuello. Crea un acabado sutil y pulido, con el cabello más largo en la parte superior que se desvanece suavemente hasta casi la piel en la parte inferior, ofreciendo un estilo versátil y moderno. ', 19900.00, '/uploads/1760735577108-Low Taper Fade Black.png', '/uploads/1760745000343-Low_Taper_Fade_Fluffy_Hair.webp', 1, NULL, 'Principal', 'Sorprendente, Iconico e Original.', 'Sorprendente, Iconico e Original.'),
(2, 'Burst Fade', 'Un burst fade es un corte de cabello con un desvanecido cónico y curvo que se enfoca alrededor de las orejas y la nuca, creando una forma de ', 19900.00, '/uploads/1760735945122-Burst Fade White.png', NULL, 0, 1, 'Relacionado', NULL, NULL),
(3, 'Low Fade', 'El low fade es un corte de pelo con un degradado bajo que comienza justo por encima de las orejas y se desvanece gradualmente hacia la parte superior de la cabeza, creando una transición suave. Este estilo es popular por su versatilidad, ya que puede ser tanto elegante como informal, y se adapta bien a diferentes tipos de cabello. La principal diferencia con otros fades es que mantiene más cabello en los lados, resultando en un look más conservador pero moderno. ', 19900.00, '/uploads/1760736403730-Low Fade White.png', NULL, 0, 1, 'Relacionado', NULL, NULL),
(4, 'Mid Fade', 'El corte Mid Fade es un estilo de peinado que se caracteriza por un degradado que comienza a la mitad de la cabeza, creando una transición gradual y suave entre el cabello más largo en la parte superior y el cabello más corto en los lados y la nuca. Ofrece un equilibrio perfecto entre un look moderno y clásico, siendo una opción versátil que se adapta a diversos estilos y largos de cabello en la parte superior. ', 19900.00, '/uploads/1760736444607-Mid Fade White.png', NULL, 0, 1, 'Relacionado', NULL, NULL),
(5, 'Skin Fade', 'Un skin fade es un corte de pelo masculino que se caracteriza por una transición gradual y suave desde el cabello más largo en la parte superior hasta la piel en los laterales y la nuca. El cabello se va acortando progresivamente con máquinas de afeitar, culminando en un acabado limpio y sin líneas marcadas, donde se ve la piel. ', 19900.00, '/uploads/1760736484679-Skin Fade Black.png', NULL, 0, 1, 'Relacionado', NULL, NULL),
(6, 'Buzz Cut', 'Un buzz cut es un corte de pelo muy corto, uniforme y uniforme en toda la cabeza, que se realiza con una máquina eléctrica. El nombre proviene del zumbido de la máquina al cortar el pelo y es popular por su facilidad de mantenimiento y su estilo moderno. Aunque tradicionalmente asociado con hombres, también es usado por mujeres y es una opción práctica para climas cálidos o para quienes desean un look minimalista. ', 19900.00, '/uploads/1760743827366-Buz cut.png', NULL, 0, NULL, 'Principal', 'Elegante & minimalista ', NULL),
(7, 'Burr Cut', 'Un corte \"burr cut\" (o buzz cut en inglés) es un corte de pelo muy corto y uniforme, realizado con una máquina eléctrica, donde el largo es el mismo en toda la cabeza. Se caracteriza por su simplicidad, facilidad de mantenimiento y un aspecto moderno y limpio que resalta los rasgos faciales. ', 19900.00, '/uploads/1760743930163-Burr Cut.png', NULL, 0, 6, 'Relacionado', NULL, NULL),
(8, 'Butch Cut', 'El \"butch cut\" (o buzz cut) es un corte de pelo militar, muy corto y uniforme, que se realiza con una máquina y deja el cabello a una longitud corta y constante en toda la cabeza. Se caracteriza por su simplicidad, facilidad de mantenimiento y por un look limpio y moderno que resalta la estructura facial. ', 19900.00, '/uploads/1760743958288-Butch Cut.png', NULL, 0, 6, 'Relacionado', NULL, NULL),
(9, 'High And Tight', '\"High and tight\" es un corte de pelo masculino que se caracteriza por los lados y la parte de atrás rapados o muy cortos, mientras que la parte de arriba se deja ligeramente más larga. Este estilo es militar y de bajo mantenimiento, con una transición que puede ser un desvanecimiento (fade) o una línea bien definida. ', 19900.00, '/uploads/1760743995854-High And Tight.png', NULL, 0, 6, 'Relacionado', NULL, NULL),
(10, 'Induction Cut', 'Visión general creada por IA\r\nEl corte por inducción es un corte de pelo muy corto y uniforme que se hace con una maquinilla sin peines, dejando una longitud mínima en toda la cabeza, similar al estilo militar. Se llama así porque es el primer corte que tradicionalmente se les da a los reclutas militares al ingresar al servicio, y su simplicidad lo convierte en un estilo práctico, limpio y de bajo mantenimiento. ', 19900.00, '/uploads/1760744026757-Induction Cut.png', NULL, 0, 6, 'Relacionado', NULL, NULL);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `productos`
--

DROP TABLE IF EXISTS `productos`;
CREATE TABLE `productos` (
  `id` int(11) NOT NULL,
  `marca` varchar(100) NOT NULL,
  `nombre` varchar(255) NOT NULL,
  `descripcion` text NOT NULL,
  `categoria` enum('Cuidado Capilar','Skincare','Barba','Accesorios') NOT NULL,
  `tipo` varchar(100) NOT NULL,
  `tamano` varchar(50) NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `imagen` varchar(500) NOT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `productos`
--

INSERT INTO `productos` (`id`, `marca`, `nombre`, `descripcion`, `categoria`, `tipo`, `tamano`, `precio`, `stock`, `imagen`, `fecha_creacion`, `fecha_actualizacion`) VALUES
(19, 'Moroccanoil', 'Shampoo Moroccanoil Hidratante', 'El champú Moroccanoil Hidratante 250ml\r\nestá formulado con aceite de argán, algas rojas y vitaminas A y E para limpiar suavemente el cabello seco y deshidratado, reponiendo la humedad y restaurando la salud capilar. Es seguro para el cabello teñido, no contiene sulfatos, fosfatos ni parabenos y deja el cabello más suave,', 'Cuidado Capilar', 'Shampoo', '250ml', 144200.00, 1, '/uploads/1762219673046-hydration-Shampoo-Hidratante-250ml-moroccanoil.jpg', '2025-11-04 01:27:53', '2025-11-04 01:27:53'),
(20, 'Olé', 'Acondicionador Algodon Y Coco', 'Descubre el poder nutritivo del Acondicionador Olé Algodón y Coco, elaborado en Colombia con una fórmula única que protege contra el resecamiento y devuelve la vitalidad a tu cabello. Enriquecido con extracto de algodón y aceite de coco, proporciona hidratación profunda, brillo radiante y una suavidad irresistible desde la primera aplicación.\r\n\r\nSu textura cremosa facilita el peinado, controla el frizz, dejando tu cabellosedoso, manejable y fortalecido. Ideal para cabello seco, dañado o sin vida, este acondicionador nutre y repara la fibra capilar, ayudando a que tu pelo luzca más saludable y lleno de movimiento.\r\n\r\n¡Por qué es especial?\r\n\r\nFormulado en Colombia, este acondicionador combina tradición, naturaleza y ciencia para ofrecer un cuidado capilar premium. Ideal para quienes buscan productos auténticos, efectivos.', 'Cuidado Capilar', 'Acondicionador', '500ml', 36000.00, 14, '/uploads/1762222642026-acondicionador-algodon_grande.webp', '2025-11-04 01:44:24', '2025-11-04 02:17:22'),
(21, 'Wella Professionals', 'Nutrición Ultimate Smooth', 'Mascarilla capilar con tecnología patentada, enriquecida con escualano y omega-9 para una nutrición profunda desde el interior y protección exterior. Tratamiento intensivo ideal para cabello encrespado, dañado y sin brillo.', 'Cuidado Capilar', 'Mascarilla', '150ml', 174600.00, 7, '/uploads/1762222501428-Wella-Professionals_Ultimate-North-Star_Ultimate-Smooth_mask_150ml_PI.webp', '2025-11-04 01:48:18', '2025-11-04 02:15:01'),
(22, 'Bio Oil', 'Aceite Bio Oil Natural', 'Descubre el poder de una belleza más consciente con el Aceite Bio Oil Natural. Creado para quienes buscan una solución 100% natural para el cuidado de su piel, este aceite combina lo mejor de la ciencia y la naturaleza. Su fórmula está elaborada con ingredientes de origen natural, como el aceite de chía, onagra y caléndula, que trabajan en sinergia para mejorar la apariencia de cicatrices, estrías y manchas de forma visible', 'Skincare', 'Aceite Corporal', '60ml', 46900.00, 43, '/uploads/1762221064839-6001159124283-2.webp', '2025-11-04 01:51:04', '2025-11-04 01:51:04'),
(23, 'Revox', 'Serum R Retinol Regenerador', 'El Serum Revox R Retinol Regenera 30 Ml combina una mezcla de aceites nutritivos y vitamina E para iluminar la piel, mejorar su elasticidad y aportar suavidad duradera. Su fórmula ultraligera se absorbe rápidamente, ofreciendo una hidratación efectiva sin sensación grasa. El retinol es conocido por reducir visiblemente las líneas de expresión, corregir imperfecciones causadas por la exposición solar y combatir los signos del envejecimiento.\r\n\r\nEl retinol, una forma activa de vitamina A esencial para el cuidado facial, no se produce naturalmente en el cuerpo y debe aplicarse tópicamente. Actúa como un antioxidante poderoso, estimulando la producción de colágeno y elastina a nivel celular, acelerando la renovación celular y regulando la producción de grasa para una piel más joven, firme y equilibrada.', 'Skincare', 'Suero Facial', '30ml', 40900.00, 15, '/uploads/1762222600367-195627-1200-auto.jpg', '2025-11-04 01:55:41', '2025-11-04 02:16:40');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `reservas`
--

DROP TABLE IF EXISTS `reservas`;
CREATE TABLE `reservas` (
  `id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `barbero_id` int(11) NOT NULL,
  `servicio_nombre` varchar(255) NOT NULL,
  `servicio_tipo` enum('corte','barba') NOT NULL,
  `servicio_adicional` tinyint(1) DEFAULT 0 COMMENT 'Si agrega servicio adicional (barba si es corte, o corte si es barba)',
  `servicio_adicional_id` int(11) DEFAULT NULL COMMENT 'ID del servicio adicional seleccionado',
  `servicio_adicional_nombre` varchar(255) DEFAULT NULL COMMENT 'Nombre del servicio adicional (ej: Mid Fade, Barba Completa)',
  `servicio_adicional_tipo` enum('corte','barba') DEFAULT NULL COMMENT 'Tipo del servicio adicional',
  `fecha` date NOT NULL,
  `hora` time NOT NULL,
  `cliente_nombre` varchar(255) NOT NULL,
  `cliente_telefono` varchar(20) NOT NULL,
  `estado` enum('pendiente','confirmada','completada','cancelada') DEFAULT 'pendiente',
  `motivo_cancelacion` text DEFAULT NULL,
  `fecha_creacion` timestamp NOT NULL DEFAULT current_timestamp(),
  `fecha_actualizacion` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `reservas`
--

INSERT INTO `reservas` (`id`, `usuario_id`, `barbero_id`, `servicio_nombre`, `servicio_tipo`, `servicio_adicional`, `servicio_adicional_id`, `servicio_adicional_nombre`, `servicio_adicional_tipo`, `fecha`, `hora`, `cliente_nombre`, `cliente_telefono`, `estado`, `motivo_cancelacion`, `fecha_creacion`, `fecha_actualizacion`) VALUES
(1, 1, 1, 'Low Taper Fade', 'corte', 0, NULL, NULL, NULL, '2025-10-27', '04:00:00', 'Juan Diego Arrieta Herrera', '3214573516', 'pendiente', NULL, '2025-10-27 02:38:48', '2025-10-27 02:38:48'),
(2, 1, 4, 'Low Taper Fade', 'corte', 1, 2, 'Anchor beard', 'barba', '2025-10-27', '08:00:00', 'Juan Diego Arrieta Herrera', '3214573516', 'pendiente', NULL, '2025-10-27 02:39:14', '2025-10-27 02:39:14'),
(3, 1, 2, 'Anchor beard', 'barba', 0, NULL, NULL, NULL, '2025-10-27', '04:00:00', 'Juan Diego Arrieta Herrera', '3214573516', 'pendiente', NULL, '2025-10-27 02:40:25', '2025-10-27 02:40:25'),
(4, 1, 4, 'Anchor beard', 'barba', 1, 5, 'Skin Fade', 'corte', '2025-10-27', '07:00:00', 'Juan Diego Arrieta Herrera', '3214573516', 'pendiente', NULL, '2025-10-27 02:40:46', '2025-10-27 02:40:46'),
(5, 2, 1, 'Low Fade', 'corte', 0, NULL, NULL, NULL, '2025-11-01', '09:00:00', 'Valentina Ojeda Pascasio', '3214573516', 'pendiente', NULL, '2025-10-31 23:00:16', '2025-10-31 23:00:16'),
(6, 2, 4, 'Mid Fade', 'corte', 1, 3, 'balbo beard', 'barba', '2025-11-08', '02:00:00', 'Valentina Ojeda Pascasio', '3214573516', 'cancelada', 'Cancelada por el usuario', '2025-11-07 23:02:15', '2025-11-07 23:02:29'),
(7, 2, 4, 'Low Fade', 'corte', 1, 8, 'van dyke beard', 'barba', '2025-11-20', '07:00:00', 'Valentina Ojeda Pascasio', '3214573516', 'pendiente', NULL, '2025-11-19 14:53:37', '2025-11-19 14:53:37');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `tienda`
--

DROP TABLE IF EXISTS `tienda`;
CREATE TABLE `tienda` (
  `id_producto` int(11) NOT NULL,
  `nombre_producto` varchar(150) NOT NULL,
  `precio` decimal(7,2) NOT NULL,
  `tipo_producto` varchar(50) DEFAULT NULL,
  `imagen_producto` varchar(255) DEFAULT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `descripcion_producto` text DEFAULT NULL,
  `fecha_agregado` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_spanish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

DROP TABLE IF EXISTS `usuarios`;
CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `nombre_completo` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `rol` enum('usuario','admin') NOT NULL DEFAULT 'usuario',
  `password_hash` varchar(255) NOT NULL,
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp(),
  `ultimo_acceso` timestamp NULL DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id`, `nombre_completo`, `email`, `rol`, `password_hash`, `fecha_registro`, `ultimo_acceso`, `activo`) VALUES
(1, 'Usuario Demo', 'usuario@demo.com', 'usuario', '$2b$10$Vkps7EuQvLelNfWHzwSwTuRQVM2Jfo2FQH8qauzJKOjaTjxwLPl6K', '2025-10-21 21:35:49', '2025-10-31 22:59:13', 1),
(2, 'Usuario Prueba', 'prueba@demo.com', 'usuario', '$2b$10$Vkps7EuQvLelNfWHzwSwTuRQVM2Jfo2FQH8qauzJKOjaTjxwLPl6K', '2025-10-21 22:55:41', '2025-11-19 14:55:56', 1),
(5, 'Administrador', 'admin@demo.com', 'admin', '$2b$10$A5u.4ku2jTzUyOO6uhgDpu3G/Xqj4OEOKwkTq7rxewUQ6YO8DVnNy', '2025-11-03 21:53:16', '2025-11-07 23:02:46', 1);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `barbas`
--
ALTER TABLE `barbas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `barba_principal_id` (`barba_principal_id`);

--
-- Indices de la tabla `barberos`
--
ALTER TABLE `barberos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `corte1_id` (`corte1_id`),
  ADD KEY `corte2_id` (`corte2_id`),
  ADD KEY `corte3_id` (`corte3_id`),
  ADD KEY `corte4_id` (`corte4_id`),
  ADD KEY `barba1_id` (`barba1_id`),
  ADD KEY `barba2_id` (`barba2_id`),
  ADD KEY `barba3_id` (`barba3_id`),
  ADD KEY `barba4_id` (`barba4_id`);

--
-- Indices de la tabla `cortes`
--
ALTER TABLE `cortes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `corte_principal_id` (`corte_principal_id`);

--
-- Indices de la tabla `productos`
--
ALTER TABLE `productos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_categoria` (`categoria`),
  ADD KEY `idx_stock` (`stock`);

--
-- Indices de la tabla `reservas`
--
ALTER TABLE `reservas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_usuario` (`usuario_id`),
  ADD KEY `idx_barbero` (`barbero_id`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_fecha_hora` (`fecha`,`hora`);

--
-- Indices de la tabla `tienda`
--
ALTER TABLE `tienda`
  ADD PRIMARY KEY (`id_producto`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_email` (`email`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `barbas`
--
ALTER TABLE `barbas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT de la tabla `barberos`
--
ALTER TABLE `barberos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de la tabla `cortes`
--
ALTER TABLE `cortes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT de la tabla `productos`
--
ALTER TABLE `productos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT de la tabla `reservas`
--
ALTER TABLE `reservas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT de la tabla `tienda`
--
ALTER TABLE `tienda`
  MODIFY `id_producto` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `barbas`
--
ALTER TABLE `barbas`
  ADD CONSTRAINT `barbas_ibfk_1` FOREIGN KEY (`barba_principal_id`) REFERENCES `barbas` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `barberos`
--
ALTER TABLE `barberos`
  ADD CONSTRAINT `barberos_ibfk_1` FOREIGN KEY (`corte1_id`) REFERENCES `cortes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `barberos_ibfk_2` FOREIGN KEY (`corte2_id`) REFERENCES `cortes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `barberos_ibfk_3` FOREIGN KEY (`corte3_id`) REFERENCES `cortes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `barberos_ibfk_4` FOREIGN KEY (`corte4_id`) REFERENCES `cortes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `barberos_ibfk_5` FOREIGN KEY (`barba1_id`) REFERENCES `barbas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `barberos_ibfk_6` FOREIGN KEY (`barba2_id`) REFERENCES `barbas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `barberos_ibfk_7` FOREIGN KEY (`barba3_id`) REFERENCES `barbas` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `barberos_ibfk_8` FOREIGN KEY (`barba4_id`) REFERENCES `barbas` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `cortes`
--
ALTER TABLE `cortes`
  ADD CONSTRAINT `cortes_ibfk_1` FOREIGN KEY (`corte_principal_id`) REFERENCES `cortes` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `reservas`
--
ALTER TABLE `reservas`
  ADD CONSTRAINT `reservas_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `reservas_ibfk_2` FOREIGN KEY (`barbero_id`) REFERENCES `barberos` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
