# Planos de la intro — Penta{sys}4.0

Cuatro planos de animación para el video de sustentación de la hackathon.
Cuentan el problema de Prestige Barbers y cómo se resolvió con Factus Pay.

| Plano | Contenido | Duración | Para narrar encima |
|---|---|---|---|
| 01 | Marca | 8 s | "Somos Penta{sys}4.0" |
| 02 | El problema | 9 s | "Prestige Barbers tenía tienda, pero no cobraba" |
| 03 | Factus Pay | 8 s | "Integramos Factus Pay: cobro por QR Bre-B" |
| 04 | Factura DIAN | 9 s | "Y al pagarse, la factura se emite sola" |

**Total: 34 segundos.** Los tiempos dejan aire para narrar encima: cada plano
termina de construirse antes de acabar y sostiene la imagen.

---

## Qué hay aquí

```
animaciones/
  index.html        motor, los 4 planos y la vista previa
  exportar.cjs      exportador por terminal
  ABRIR PLANOS.bat  lanzador
  exportado/        los MP4 resultantes
```

---

## Cómo usarlo

**Ver los planos:** doble clic en `ABRIR PLANOS.bat`, o abrir `index.html`.

**Exportar**, desde esta carpeta:

```
node exportar.cjs        los cuatro planos
node exportar.cjs 2      solo el plano 02
node exportar.cjs todo   la secuencia completa en un archivo
```

**Cambiar la duración de un plano:** buscar su `dur:` en `index.html`. El campo
`sostiene:` marca el segundo a partir del cual la imagen ya está construida y
aguanta sola, que es hasta dónde se puede alargar sin que se vea lento.

---

## Por qué está hecho con código

**Coherencia.** El negro `#1b1b1b` y la tipografía Montserrat son los mismos
del sitio de Prestige Barbers. El logo no es una imagen pegada: se reconstruye
con geometría, así que se puede dibujar trazo a trazo y a cualquier escala sin
pixelarse.

**Precisión.** Que un plano dure "unos 9 segundos" no sirve cuando hay que
encajarlo bajo una frase. Aquí la duración es un número.

**Reproducibilidad.** Cambiar un tiempo es cambiar una cifra y volver a
exportar, no rehacer una línea de tiempo.

---

## El detalle que importa para el editor

Los MP4 salen con **framerate constante y todos los fotogramas clave**. Eso es
lo que necesitan DaVinci Resolve y Premiere para cortar en cualquier punto.

La vía evidente habría sido `MediaRecorder`, la API de grabación del navegador.
Produce un archivo que se ve bien en cualquier reproductor, pero los editores
lo rechazan: graba en tiempo real y sella cada fotograma con el reloj del
sistema, así que el framerate queda variable.

El exportador no graba: **renderiza**. Le pide al motor la escena en un instante
exacto, guarda el PNG, y al final los une con ffmpeg. El instante 1,4667 s es
el fotograma 44 de 30 fps, calculado, no capturado.

Verificado en el resultado:

```
intervalos entre fotogramas   1 solo valor (0,03333 s)
perfil / píxel / rango        High / yuv420p / tv
framerate                     30/1
```

**Si un archivo no entra en el editor**, comprobar de dónde salió:

```
ffprobe -v error -select_streams v:0 -show_entries stream=profile,pix_fmt,color_range -of csv=p=0 archivo.mp4
```

Si dice `High,yuv420p,tv` está bien.

---

## Dependencias

**ffmpeg**, **Node.js** y **Chrome** (o Edge). Las tres ya estaban instaladas en
el equipo. No hay paquetes de npm: el exportador habla con el navegador por el
protocolo DevTools usando el WebSocket nativo de Node 22.
