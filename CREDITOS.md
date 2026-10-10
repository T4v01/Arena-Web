# Créditos de assets

Todo lo usado es gratuito y de licencia libre. Se deja constancia por
transparencia y por si quieres/debes dar atribución.

## Personajes (Guerrero, Asesino, Mago)
Pack **"LowPoly RPG Characters" de Quaternius**, licencia **CC0** (dominio
público). Incluye modelo, esqueleto, texturas y animaciones (idle, caminar,
correr, ataques, recibir golpe, muerte, roll) para cada clase. Este pack lo
proporcionó el usuario (descargado de OpenGameArt), no se descargó
automáticamente por el asistente.

## Escenario de ambientación
- `arena.glb` (dungeon_warkarma) — tomado del repositorio oficial de
  ejemplos de **three.js**
  (https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf).
  Se usa como decoración visual de fondo; los muros, cajas y escaleras con
  los que sí se puede colisionar/subir son geometría propia generada por
  código (ver `game.js`).

## Música
- Repositorio **free-music** de Tanner Helland
  (https://github.com/tannerhelland/free-music), licencia
  **Creative Commons Attribution 4.0** — requiere atribución tipo
  "música de Tanner Helland" + enlace al repositorio si publicas el juego.
  Pistas usadas: *Assault on Mist Castle* (menú), *Retribution* y
  *Reign of Anarchy* (combate).

## Efectos de sonido
- Pack de audio de **Kenney** (kenney.nl), licencia **CC0** (dominio
  público, no requiere atribución aunque se agradece):
  impactos metálicos, cortes de daga, desenvainar, pasos, sonidos
  digitales usados como base de los hechizos del Mago.

## Nota sobre las animaciones de ataque
A diferencia de la primera versión, estos personajes sí traen animaciones
de ataque reales grabadas por el propio autor del modelo (por ejemplo
`Sword_Attack` para el Guerrero, `Dagger_Attack`/`Dagger_Attack2` para el
Asesino, `Staff_Attack`/`Spell1`/`Spell2` para el Mago), además de
`RecieveHit` (recibir golpe), `Death` (muerte) y `Roll` (voltereta, usada
para las habilidades de desplazamiento). El código ya no necesita generar
ninguna animación por procedimiento.

## Cielo
HDRI real (equirectangular) de **Poly Haven**, licencia **CC0**, empaquetado
en el repositorio de ejemplos de three.js
(`examples/textures/equirectangular/venice_sunset_1k.hdr`).

## Efectos visuales (partículas)
**Kenney Particle Pack**, licencia **CC0** — sprites de fuego, humo,
chispas, tajos y destellos mágicos usados en las habilidades, en vez de
figuras geométricas simples.

## Clérigo y Arquero
Vienen del mismo pack "LowPoly RPG Characters" de Quaternius (CC0) que ya
habías subido — se usaron dos personajes más del mismo pack para llegar a
5 clases.

## Monstruos
**Animated Monster Pack de Quaternius** (CC0) — Slime, Esqueleto y
Dragón, con sus animaciones de idle/caminar/atacar/morir originales.
Subido por el usuario (OpenGameArt).

## Segunda estructura del mapa (templo)
`structure2.glb` ("nemetona") — del mismo repositorio de ejemplos de
three.js que la mazmorra, usado aquí para dar variedad visual al mapa.

## Sonidos adicionales de habilidades
Más sonidos del pack de Kenney (CC0): curación, escudo, parpadeo/dash,
grito de guerra y golpe sagrado, además de sonido de subir de nivel.
