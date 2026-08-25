[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md)

# Super Boring Battleship Game

> Juego ligero de combate naval 3D de la Segunda Guerra Mundial para un jugador, creado por **koko**, con maniobra deliberada, balística legible y daños modulares.

[Descargar la última versión de directorio para Windows (ZIP)](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest)

## Acerca del juego

Dirige destructores, cruceros ligeros y acorazados en batallas de diez minutos contra la IA o en pruebas de mar sin límite. Maniobra el buque, organiza el control de daños y emplea artillería, torpedos, cargas de profundidad y aviación embarcada. El proyecto prioriza equipos modestos y usa TypeScript, Babylon.js, Vite y Electron.

Todavía es un prototipo en desarrollo. Los gráficos, el equilibrio, los modelos y la progresión seguirán mejorando.

## Funciones actuales

- Órdenes de máquinas, timón gradual, pérdida de velocidad en giro y respuesta al daño de módulos.
- Trayectorias visibles, dispersión, recarga, torretas independientes, penetración HE/AP y daño por compartimentos.
- Arcos de torpedo, abanicos estrecho/amplio, distancia de armado, alcance, predicción y daños del lanzador.
- Humo, hidrófono, incendios, inundación, reparaciones según tripulación, salud recuperable y colisiones por zona.
- Observación óptica de IA no omnisciente con contactos perdidos y marcas de última posición que se desvanecen.
- Aviación pilotada por IA; el jugador ordena selección de área, movimiento, escolta, patrulla, intercepción y ataque naval.
- Arsenal sin pagos, inventario, astillero, perfil local e investigación de equipo histórico.
- Interfaz en 简体中文, 繁體中文, English, 日本語, Español, Deutsch y Русский.

## Controles principales

| Tecla | Acción |
|---|---|
| `W` / `S` | Aumentar o reducir la orden de máquinas |
| `A` / `D` | Timón a babor / estribor |
| Ratón / rueda | Mover la cámara / ajustar la distancia de tiro |
| `R` / `Space` | Alternar mira / disparar el arma seleccionada |
| `1` / `2` / `3` | Batería principal / torpedos / aviación |
| `Q` | Cambiar munición o abanico de torpedos |
| `E` / `F` / `G` | Humo / hidrófono / cargas de profundidad |
| `H` | Mantener para reparar el casco |
| `M` / `F3` / `Esc` | Mapa táctico / depuración / salir o pausar |

## Inicio en Windows

Descarga el ZIP x64 más reciente desde [Releases](https://github.com/Arsenic-er/Game-Super-Boring-Battleship/releases/latest), extráelo por completo en una sola carpeta y ejecuta `Super Boring Battleship Game.exe`. No muevas el EXE fuera de la carpeta que contiene `resources` y los archivos DLL. No requiere instalación. SmartScreen puede advertir que la compilación independiente no está firmada.

## Desarrollo

Requiere Node.js 24.x y npm.

```bash
npm install
npm test
npm run build
npm run desktop:dist
npm run desktop:zip
```

`desktop:dist` crea el directorio `release/win-unpacked`; `desktop:zip` crea el ZIP de distribución con el directorio completo.

## Derechos de autor

Código y arte originales © 2026 **Arsenic-er (koko)**. Todos los derechos reservados; actualmente no se concede licencia de código abierto. El software de terceros y Fusion Pixel Font conservan sus propias licencias. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
