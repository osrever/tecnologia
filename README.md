# Autoevaluación TIC Escrita

Aplicación para Tecnologías para la Información y la Comunicación Escrita (2710009), Grado en Periodismo de la Universidad de Sevilla, curso 2026–2027, grupos 3 y 4.

## Puesta en marcha

El frontend usa React y Vite. Node.js 24 y SQLite sirven la aplicación y su API desde un mismo origen. El servidor requiere un volumen persistente y un único proceso de aplicación. GitHub Pages publica la pantalla de entrada y enlaza al servidor cuando se configura la variable de repositorio `APP_ORIGIN`.

```sh
npm ci
npm test
npm run build
mkdir -m 700 -p private
node server/manage.js teacher private/profesor.json
node server/manage.js students private/alumnado.json
node server/manage.js bank private/banco.json
npm start
```

La URL local es `http://localhost:3000`. Para desarrollo, `npm run dev` ejecuta Vite en el puerto 5173 y reenvía la API al servidor local. Para que el acceso docente funcione, carga el campo `hash` de la credencial del profesor en `TEACHER_HASH` mediante el gestor de secretos del servidor. El campo `code` se usa en el formulario de acceso del profesorado.

En producción configura `NODE_ENV=production`, `APP_ORIGIN=https://dominio`, `TEACHER_HASH` y `DB_PATH` en un volumen persistente con permisos privados. Pon el servidor detrás de un proxy HTTPS y limita el puerto interno a ese proxy. `BIND` y `PORT` permiten ajustar la escucha. Para Pages, selecciona **GitHub Actions** en **Settings → Pages** y ejecuta **Pruebas y GitHub Pages**. La variable de GitHub `APP_ORIGIN` es pública y contiene solo el origen HTTPS.

Para un servidor con contenedores, ejecuta `docker build -t autoevaluacion-tic .`. Arranca la imagen con un volumen persistente privado en `/app/private`, las variables anteriores y un proxy HTTPS. Los comandos de gestión también se pueden ejecutar dentro del contenedor con `docker exec`. El usuario del servidor dentro del contenedor tiene UID 1000. Evita exponer directamente el puerto 3000 a Internet.

## Incorporar alumnado

Prepara un JSON privado con una lista de objetos que contienen `first`, `last` y `group` (3 o 4). De la columna «APELLIDOS, NOMBRE» toma el texto anterior a la coma como apellidos y el posterior como nombre. Reúne ambos grupos en el mismo archivo y excluye las demás columnas. Ejecuta el comando de altas en el servidor. Las altas existentes conservan su identificador. Las coincidencias ambiguas bloquean el acceso por ese nombre hasta que se importe un listado conjunto corregido. Revisa manualmente que una ficha preexistente corresponda a la persona que conserva el nombre una vez resuelta la colisión.

`node server/manage.js delete-student ID` elimina la ficha, sus accesos, sesiones e intentos de la base operativa. El ID se obtiene del listado devuelto al panel de administración.

## Actualizar el temario

Importa un JSON privado con `topics` (nueve objetos `id` y `title`) y `questions`. Cada pregunta admite `id`, `topic`, `concept`, `prompt`, `options` (cuatro alternativas), `correct` (índice de 0 a 3), `explanation`, `reference`, `difficulty` (baja, media o alta), `status` (pendiente o validada) y `active` (booleano). El panel docente permite editar, activar, desactivar, eliminar y exportar el banco. Mantén los identificadores al corregir o actualizar preguntas existentes. La importación incrementa la versión al detectar cambios y cada intento guarda la versión que se presentó, con sus opciones barajadas.

Antes de activar una pregunta, comprueba la respuesta, los distractores y la referencia en los apuntes vigentes. Un tema necesita al menos 20 preguntas activas para generar un examen dedicado exclusivamente a ese tema.

## Seguridad y mantenimiento

Las sesiones expiran a las 12 horas, se transmiten en cookies HttpOnly y tienen la marca Secure en producción. Las mutaciones verifican el origen. El código de administración docente se verifica con scrypt y los fallos docentes tienen un límite temporal en memoria. El acceso del alumnado valida el nombre completo contra el listado privado, sin verificación de identidad. La corrección, las soluciones y el control de permisos residen en el servidor. El historial se asocia al nombre reconocido en la sesión. Quien conozca un nombre matriculado puede consultar su historial y realizar pruebas atribuidas a ese nombre. Los resultados son orientativos y carecen de efectos en la evaluación oficial. El registro guarda las fechas de inicio de sesión y la actividad de las pruebas. La aplicación no almacena direcciones IP. Las exportaciones docentes contienen resultados personales y deben guardarse en almacenamiento institucional autorizado.

Antes de incorporar alumnado real, acuerda con la Universidad la base jurídica, el aviso de privacidad, el proveedor de alojamiento, los plazos de conservación y el circuito de acceso, exportación y supresión. Limita el acceso al volumen, configura copias cifradas y prueba su restauración. Aplica el plan de supresión también a copias y exportaciones. Conserva el banco y los datos exclusivamente en almacenamiento privado.

Las pruebas usan una base SQLite temporal y cuentas sintéticas reservadas a pruebas. Cubren los dos grupos, la normalización, la distribución y el barajado, la fórmula, la sesión, la corrección, el historial, la revisión, la edición versionada, el CSV y el aislamiento de permisos.
