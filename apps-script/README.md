# Autoevaluación TIC Escrita en Google Apps Script

Esta variante mantiene la interfaz React y reutiliza la lógica de selección, barajado y corrección de preguntas. La aplicación se sirve desde Apps Script y se comunica con el servidor mediante `google.script.run`. Los datos se guardan en un libro de Google Sheets que pertenece al propietario y se mantiene privado.

## Construcción y pruebas

```sh
npm ci
node apps-script/build.mjs
node apps-script/check.mjs
```

El paquete está en `dist/apps-script` y contiene `Index.html`, `Code.gs`, `Exam.gs` y `appsscript.json`. Los datos y las credenciales se configuran fuera del repositorio. La prueba local opcional admite como argumento la ruta al banco privado para verificarlo sin publicar las soluciones.

## Despliegue

1. Accede con la cuenta propietaria del proyecto Apps Script existente. Antes de cargar el paquete, descarga el código del proyecto y comprueba que no haya cambios que se deban conservar. El manifiesto incluye un despliegue inicial para el propietario.
2. Carga los cuatro archivos en el proyecto. Si usas la CLI oficial clasp, su configuración debe apuntar al ID de ese proyecto y a `dist/apps-script`. Necesita la autorización de Google para gestionar Apps Script.
3. En las propiedades del proyecto configura `BANK_FILE_ID` con el archivo privado de Drive y `GROUP_3_SHEET_ID` y `GROUP_4_SHEET_ID` con las hojas de asistencia de los grupos. Genera un código docente aleatorio de al menos 32 caracteres y guarda su SHA-256 hexadecimal en `TEACHER_HASH`. Comparte el código con el docente mediante un canal privado.
4. Como propietario, ejecuta `setupPrivate_` para crear el almacén y `importBank_` para cargar el temario. Sigue las indicaciones de Google para autorizar los permisos. La rutina de configuración solo añade la ficha de Paco de forma inicial.
5. Crea una primera versión privada. Comprueba el acceso de Paco, la sesión del profesor, el examen, la separación de datos y que el libro de almacenamiento no esté compartido.
6. Tras confirmar el alcance de acceso autorizado, importa el alumnado con `importStudents_`. Lee solo la columna A, desde la fila 7 de la pestaña «Lista de clase». Verifica con la cuenta propietaria qué modalidad de acceso permite Google Workspace y prueba con un alumno antes de distribuir la URL. Enlaza la URL pública desde GitHub Pages cuando la aplicación esté lista.

## Continuidad de los datos

El identificador `DATABASE_ID` apunta al mismo libro entre versiones y redespliegues. Conserva una copia en Drive privado y comprueba su restauración con un despliegue privado antes de sustituir el libro activo. La cuenta de Paco queda fuera del listado docente, las estadísticas y el CSV. Los permisos del proyecto Apps Script y del libro se gestionan por separado.

## Actualización del banco literal en la instalación de un archivo

El flujo `Paquete de Google Apps Script` genera también `instalacion-en-un-archivo`. En el proyecto existente, sustituye el contenido de `Código.gs` por el del archivo de instalación y ejecuta `prepararPrueba` como propietario. Esta función localiza en Drive el banco literal por nombre y huella SHA-256, incorpora sus preguntas y desactiva las de la versión anterior para nuevos exámenes. Las pruebas en curso y las terminadas conservan sus preguntas y respuestas.

En **Gestionar implementaciones**, edita la implementación existente y selecciona **Nueva versión** para conservar su URL y sus permisos. Las selecciones se reflejan de inmediato y las respuestas se envían a Google Sheets en lotes. La aplicación confirma el guardado antes de corregir el examen.

Para validar y regenerar el banco, conserva de forma privada los archivos originales `1.txt` a `9.txt` y las selecciones `literal-1.txt` a `literal-9.txt`. Cada fila de selección contiene seis campos separados por `|`: apartado, cita completa, fragmento omitido y tres distractores. Ejecuta `node apps-script/build-literal-bank.mjs DIRECTORIO_FUENTES BANCO_ANTERIOR SALIDA_PRIVADA`. El generador verifica que cada cita y cada respuesta coincidan con su fuente. Después de guardar el banco en Drive privado, actualiza la huella que usa `prepararPrueba` antes de crear un paquete de instalación.

En la instalación manual, el propietario puede ejecutar `activarAlumnado` desde el editor después de configurar las dos propiedades `GROUP_3_SHEET_ID` y `GROUP_4_SHEET_ID`. La función comprueba ambos listados antes de actualizar el acceso y registra únicamente el número de estudiantes por grupo. Conserva los identificadores de los estudiantes ya importados y no copia asistencia ni otras columnas. A continuación se puede cambiar el acceso de la implementación web para un piloto y probar la misma URL con una cuenta distinta de la del propietario.
