# Arena Web — Combate 3D multijugador (estilo Rakion)

## IMPORTANTE: qué pasó con la carga colgada
El templo que agregué la ronda pasada (`structure2.glb`) venía comprimido
con Draco y me faltaba configurar el decodificador — por eso el juego se
quedaba cargando a la mitad y la consola mostraba
`THREE.GLTFLoader: No DRACOLoader instance provided`. Ya está corregido.

Además, siguiendo lo que dijiste, **saqué esa segunda estructura por
completo** en vez de solo arreglar el bug: ahora el mapa usa **una única
estructura real** (la mazmorra, agrandada) en el centro, rodeada de una
**muralla perimetral propia con 4 portones reales y torres** — todo
conectado a propósito por mí, no piezas sueltas copiadas sin relación
entre sí.

Los dos warnings de `FBXLoader: Vertex has more than 4 skinning weights`
son inofensivos (el loader recorta automáticamente a 4 influencias por
vértice, que es el máximo estándar) — no afectan nada, los puedes
ignorar.

## Mapa — rediseñado como pediste
- **Una sola estructura grande y completa** (la mazmorra) en el centro,
  no varias copias sueltas.
- **Muralla perimetral conectada** con 4 portones (huecos reales donde
  llegan los caminos) y torres en cada esquina y flanqueando cada
  portón — toda arquitectura propia, así que la colisión es exacta (sin
  el problema de "caja que tapa la puerta" de antes).
- Caminos desde cada portón hacia el patio central, con antorchas y
  cajas a los lados.
- Si encuentras un pack de piezas modulares de castillo/mazmorra (del
  estilo "estas piezas encajan entre sí") en CC0, pásamelo y puedo armar
  algo aún más grande y variado con eso — no encontré ninguno accesible
  desde donde yo busco.

## Resto de funcionalidad — sin cambios respecto a la ronda anterior
Colisión real solo contra mis muros/cajas/torres (el escenario descargado
es superficie pisable pero no bloquea), monstruos con barra de vida y
evasión básica, habilidades con efectos mejorados (cristales de hielo
reales, veneno en el objetivo correcto, cúpulas de escudo, etc.), cámara
arriba/abajo e izquierda/derecha corregidas.

## Instalación en tu Ubuntu (Oracle Cloud)
```bash
cd rakion-web
npm install
node server.js
```
Puerto 3000, firewall/Security List ya configurados, entra desde
`http://146.181.42.48:3000`.

## Ajustar cosas fácilmente
- Balance de clases/habilidades/monstruos: `CLASSES`, `ABILITIES`,
  `MONSTER_DEFS`, `MONSTER_SPAWNS` en `server.js`.
- Mapa (escala de la mazmorra central, portones, torres, caminos):
  dentro de `preload()` y el bloque de obstáculos en `game.js`.
- Efectos visuales de cada habilidad: funciones `fx...` en `game.js`.
