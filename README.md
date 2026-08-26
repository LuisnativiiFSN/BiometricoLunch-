# Comedor biometrico

Scaffold del Modulo 1 del sistema de gestion de comedor.

## Arquitectura

```text
React (apps/web)
       |
       v
NestJS API (apps/api)
       |
       v
Microsoft SQL Server (servidor de la empresa)
```

## Requisitos

- Node.js 20.19, 22.12 o 24 (se recomienda Node.js 24 LTS)
- pnpm 11
- Acceso de red a una instancia de Microsoft SQL Server 2017 o posterior
- Una base de datos creada y credenciales de SQL Server

## Inicio rapido

1. Instalar dependencias:

   ```bash
   pnpm install
   ```

2. Crear la configuracion local de la API:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

   En PowerShell:

   ```powershell
   Copy-Item apps/api/.env.example apps/api/.env
   ```

3. Configurar en `apps/api/.env` la conexion de SQL Server. La aplicacion usa
   `DB_SERVER`, `DB_PORT`, `DB_DATABASE`, `DB_USER` y `DB_PASSWORD`. Prisma CLI
   utiliza `DATABASE_URL`. Nunca copies estas credenciales al frontend.

4. Crear o actualizar las tablas y generar Prisma Client:

   ```bash
   pnpm db:deploy
   pnpm db:generate
   ```

5. Levantar React y NestJS:

   ```bash
   pnpm dev
   ```

Servicios locales:

- Web: http://localhost:5173
- API: http://localhost:3000/api
- Salud y conexion a SQL Server: http://localhost:3000/api/health

## Empleados

Rutas disponibles:

- `GET /api/employees`: listar empleados.
- `GET /api/employees?search=texto`: buscar por codigo, nombre, correo o departamento.
- `GET /api/employees?active=true`: listar unicamente empleados activos.
- `GET /api/employees/:employeeCode`: obtener un empleado por su codigo.
- `POST /api/employees`: crear un empleado.
- `PATCH /api/employees/:employeeCode`: editar, activar o desactivar un empleado.

Ejemplo de creacion:

```json
{
  "employeeCode": "18358",
  "name": "Carlos Hernandez",
  "email": "carlos@empresa.com",
  "department": "Produccion",
  "active": true
}
```

`employeeCode` es la llave primaria de `employees`; no existe un UUID adicional
para el empleado. El mismo codigo se guarda en `employee_id` dentro de huellas,
reservas y solicitudes de comida. `department` es obligatorio al crear un
empleado.

No existe una ruta `DELETE`; los empleados se desactivan enviando
`{ "active": false }` mediante `PATCH` para conservar su historial.

La interfaz React incluye listado, busqueda, creacion, edicion y cambio de estado.
Consume exclusivamente la URL de NestJS configurada con `VITE_API_URL`; si no se
define, utiliza `http://localhost:3000/api`.

## Simulador de huella

La opcion **Simulador** de la interfaz permite seleccionar un empleado activo,
simular su identificacion y solicitar el almuerzo mientras no se dispone del
lector biometrico.

Tambien se puede probar desde Insomnia:

- Metodo: `POST`
- URL: `http://localhost:3000/api/kiosk/request-meal`
- Encabezado: `Content-Type: application/json`
- Cuerpo JSON:

```json
{
  "employeeId": "18358"
}
```

Para obtener un codigo valido, primero consulta
`GET http://localhost:3000/api/employees?active=true` y copia `employeeCode` de
uno de los empleados. La API usa la fecha de `America/El_Salvador`, valida al
empleado y busca su reserva `LUNCH` para hoy.

Posibles estados funcionales:

- `EMPLOYEE_NOT_FOUND`: el codigo no pertenece a un empleado.
- `EMPLOYEE_INACTIVE`: el empleado existe, pero esta inactivo.
- `NO_MEAL_RESERVED`: esta activo, pero no tiene almuerzo reservado para hoy.
- `APPROVED`: la reserva existe y la entrega fue registrada.
- `DUPLICATE`: ya retiro la comida; el nuevo intento queda auditado.

Las respuestas `APPROVED` y `DUPLICATE` incluyen el nombre de la comida enviado
por NestJS. En una aprobacion tambien se devuelve la fecha, el tipo y la hora de
entrega. SQL Server mantiene un indice unico filtrado que impide dos registros
`APPROVED` para la misma combinacion de empleado, fecha y tipo, incluso ante
solicitudes simultaneas.

Esta ruta no captura ni almacena huellas reales.

## Enrolamiento biométrico

La API incorpora rutas exclusivas para la aplicación WinUI de mantenimiento:

- `GET /api/biometrics/enrollment-candidates`: devuelve empleados activos sin ningún
  registro en `fingerprints` para mantener actualizado el selector de enrolamiento.
- `POST /api/biometrics/enrollment-authorizations`: identifica una huella y emite una
  autorización de un solo uso solamente para personal activo de `GESTION HUMANA-FSN`.
- `POST /api/biometrics/enrollments`: valida al empleado activo, reemplaza de forma
  transaccional el mismo dedo y guarda la plantilla cifrada. Requiere la autorización
  biométrica vigente, ligada al empleado y dedo, y la consume al utilizarla.
- `GET /api/biometrics/employees/:employeeCode`: devuelve únicamente metadatos.
- `PATCH /api/biometrics/enrollments/:id/deactivate`: desactiva sin borrar historial.

Las respuestas nunca incluyen `template_data`. El FMD ANSI recibido se cifra con
AES-256-GCM antes de entrar a SQL Server. El sobre binario utiliza la firma `MCB1`,
versión 1, nonce de 12 bytes, etiqueta de 16 bytes y texto cifrado autenticado.

La API exige una clave Base64 de exactamente 32 bytes en
`BIOMETRIC_ENCRYPTION_KEY`. Para generar una clave de desarrollo:

```powershell
[Convert]::ToBase64String(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
)
```

Copie el resultado solamente a `apps/api/.env` o al almacén de secretos del entorno.
Nunca lo coloque en React, WinUI, el repositorio, capturas o registros. Respaldar y rotar
esta clave requiere un procedimiento de producción; perderla impide usar las plantillas.

Si SQL Server se alcanza mediante IP pero su certificado usa un nombre DNS, configure
`DB_SERVER` con la IP y `DB_TLS_SERVER_NAME` con el nombre del certificado. En este
entorno se validó `10.0.20.198` con nombre TLS `F50-BC`.

La migración `20260820101500_fingerprint_active_finger_unique` impide más de una huella
activa por empleado y posición, sin eliminar registros históricos.

## Identificación biométrica 1:N

`POST /api/biometrics/identify` recibe un FMD candidato `ANSI_378_2004`. NestJS carga
solo los enrolamientos activos, los descifra temporalmente y ejecuta el comparador C#
interno que usa el SDK DigitalPersona. La aplicación WinUI nunca descarga la galería.

El umbral predeterminado es 21474, equivalente a `0x7fffffff / 100000` y tomado del
ejemplo oficial del SDK. Puede configurarse únicamente en la API con
`BIOMETRIC_MATCH_THRESHOLD`. `BIOMETRIC_MATCHER_PATH` permite indicar la ubicación del
ejecutable en un despliegue; durante desarrollo se resuelve automáticamente desde el
proyecto C# compilado en Release x64.

La ruta devuelve `IDENTIFIED`, `NOT_IDENTIFIED` o `AMBIGUOUS`. Solo `IDENTIFIED` incluye
código y nombre del empleado, nunca plantillas ni puntajes. Después, WinUI envía ese
`employeeCode` a `/api/kiosk/request-meal`; SQL Server conserva la autoridad sobre
reservas, estado activo y duplicidad.

El kiosco usa estados separados para conexión, captura, identificación, validación de
comida y resultados. Además de `APPROVED`, `DUPLICATE`, `NO_MEAL_RESERVED` y
`EMPLOYEE_INACTIVE`, controla huella no identificada, mala calidad, lector desconectado
y API no disponible. Los resultados muestran empleado, comida y hora cuando corresponde,
y regresan automáticamente a lectura después de cinco segundos.

## Comidas y reservas

La tabla `meals` es el catálogo de comidas disponibles. Cada fila contiene el
nombre, la fecha de disponibilidad (`available_date`), el tipo de comida, su
estado activo y las fechas de creación y actualización. Un mismo nombre puede
volver a ofrecerse en fechas diferentes.

La tabla `meal_reservations` relaciona a un empleado con una fila de `meals`.
Incluye:

- empleado que reserva (`employee_id`)
- empleado receptor futuro y opcional (`transfer_employee`)
- comida reservada (`meal_id`)
- fecha (`meal_date`)
- tipo (`meal_type`, `LUNCH` por defecto)
- cantidad (`quantity`, inicia en `1`)
- fechas de creación y actualización

El nombre ya no se repite en la reservación: se consulta mediante `meal_id`.
SQL Server impide que un empleado tenga dos reservas para la misma combinación
de fecha y tipo; por tanto, solo puede reservar un almuerzo por día. También
valida que `quantity` sea al menos `1` y que los empleados y la comida existan.

Cada `meal_request` nuevo queda relacionado mediante `meal_reservation_id` con
la reserva que produjo la entrega. La relacion impide borrar una reserva que ya
tenga entregas y conserva el historial. SQL Server tambien exige la relacion en
toda nueva fila `APPROVED`. Los registros creados antes de esta regla mantienen
la relacion vacia para no perder informacion existente.

`GET /api/meals/available-today` devuelve los almuerzos activos del día. La
solicitud manual del portal usa esos IDs y `POST /api/meals/reservations/manual`
recibe `employeeId` y `mealId`.

En `meal_reservations.employee_id` y `meal_requests.employee_id` se guarda
directamente el codigo del empleado, lo que facilita consultar el historial sin
traducir UUIDs.

## Datos de prueba

El seed crea reservas para la fecha actual de El Salvador:

- Carlos Hernandez: `CARNE EMPANIZADA`.
- Andrea Lopez: `POLLO EN SALSA`.
- Pedro Martinez: sin reserva.

Ejecutar:

```bash
pnpm db:seed
```

El seed es repetible y reinicia solamente las entregas de sus propios empleados
de prueba. Si alguno de los codigos `18358`, `18359` o `18360` ya pertenece a
otra persona, utiliza un codigo alternativo con prefijo `SEED-` para no
sobrescribirla.

## Tablas técnicas y futuras

`_prisma_migrations` pertenece a Prisma y registra cuáles migraciones ya se
aplicaron, cuándo terminaron y si fallaron. No contiene datos del comedor y no
debe editarse ni eliminarse manualmente.

`audit_logs` queda preparada para registrar operaciones `CREATE`, `UPDATE` y
`DELETE`, con la entidad afectada, valores anteriores/nuevos, actor y fecha. En
esta fase solo se crea la estructura; todavía no hay procesos que escriban logs.

`tickets` se conserva por compatibilidad con el diseño original, aunque el flujo
actual de API y kiosco no crea ni consulta tickets. `email_jobs` fue eliminada
porque no tenía un proceso activo y dependía de esa funcionalidad futura.

## Inicio de sesión y roles

La tabla `users` contiene las cuentas internas del portal. Las contraseñas se
guardan únicamente como hashes bcrypt con factor de trabajo 12. La sesión viaja
en una cookie `HttpOnly` y `SameSite=Strict`, vence a las ocho horas y no se
guarda en `localStorage`. La API valida la cuenta, su estado y el rol en cada
solicitud protegida.

La cuenta inicial usa el nombre `admin`. Su contraseña fue cargada directamente
como hash durante la migración y la cuenta está marcada como protegida: no puede
desactivarse ni cambiar su contraseña desde el portal.

Permisos del portal:

- Público: `Encargar comida`, `Iniciar sesión` y `Consulta`.
- Administrador: todas las páginas visibles, configuración del menú semanal, horarios de cierre y administración de usuarios.
- Recursos Humanos: resultados semanales, resultados de hoy, menú semanal, horarios de cierre, encargar comida, empleados, entregas, pendientes, transferencias y consulta.
- Chef: resultados semanales, resultados de hoy, entregas y pendientes. No tiene acceso a Encargar comida, Consulta, Empleados ni a la configuración del menú.

## Menú y reservaciones semanales desde el portal

Administrador y Recursos Humanos pueden publicar las opciones de almuerzo de la
semana actual o de semanas futuras desde `Menú semanal`. La semana siempre
comprende de lunes a viernes y requiere al menos una comida por día. Un plato
que ya tenga reservaciones no puede quitarse del menú.

Cuando se prepara una semana futura, el menú queda `Programado para el lunes`:
no aparece anticipadamente en la reservación pública y se activa automáticamente
al comenzar ese lunes. La activación solo ocurre si los cinco días están
completos. El tablero de resultados conserva siempre el rango laboral de lunes
a viernes, incluso cuando la semana comienza en un mes y termina en el siguiente.

La página pública `Encargar comida` no requiere iniciar sesión. El empleado
ingresa su código, revisa sus selecciones existentes y elige como máximo una
comida por día. Al guardar, el sistema crea los días nuevos, actualiza los que
cambiaron y cancela los que se dejaron sin selección, todo dentro de una sola
operación. Antes de confirmar, el portal presenta el nombre, código y comidas
seleccionadas. Las fechas anteriores, las reservaciones entregadas o transferidas
y el día actual después del cierre quedan protegidos contra cambios. La hora se
configura desde `Menú semanal` por Administrador o Recursos Humanos. Puede usarse
una sola hora para toda la semana o una hora distinta para cada día. Si una
semana todavía no tiene configuración guardada, se utiliza
`MEAL_ORDER_CUTOFF_TIME` y su valor predeterminado es `08:00`.

La información está dividida en dos pantallas para Administrador, Recursos
Humanos y Chef. `Resultados semanales` muestra el total de reservaciones de la
semana, el resumen por día, el total de cada plato y barras comparativas para
preparar el reporte del Chef. Cada día también indica su hora de cierre y si aún
está recibiendo solicitudes. `Resultados de hoy` contiene únicamente el gráfico
de entregadas contra pendientes y la lista de personas que todavía no han
reclamado su comida.

Después de abrir el portal o iniciar sesión, la primera pantalla es `Encargar
comida`. Las rutas
de empleados validan la sesión y el rol en la API: únicamente Administrador y
Recursos Humanos pueden consultarlas o modificarlas; Chef recibe una respuesta
de acceso denegado aunque intente llamar el endpoint directamente.

En `Pendientes` se puede buscar el código exacto de un empleado. La consulta se
realiza en la API sobre las reservaciones del día que todavía no tienen una
entrega aprobada; si no existe una coincidencia, el portal indica que ese código
no tiene comida pendiente para hoy.

### Transferencias de almuerzo

La página `Transferencias` está disponible para los roles `ADMIN` y `RH`. El
operador busca el código de quien reservó originalmente y el portal muestra
todas sus comidas pendientes desde la fecha actual en adelante. Después elige
una reservación e ingresa el código del beneficiario. La reservación conserva
`employee_id` como evidencia de quién la creó y utiliza `transfer_employee` para
definir quién recibirá y pagará la comida.

Después de transferir de D1 hacia D2:

- D1 deja de aparecer en pendientes y su código ya no puede retirar la comida.
- D2 aparece como pendiente, genera la entrega y queda asociado al posible ticket.
- la consulta mensual excluye la reservación de D1 y la suma al recuento de D2.
- `meal_requests.employee_id` se guarda con el código de D2 cuando se entrega.
- `audit_logs` guarda una acción `TRANSFER`, el usuario RH que la realizó, la
  reservación afectada, el origen, el beneficiario y la fecha.

La API rechaza fechas pasadas, comidas ya entregadas, una segunda transferencia,
empleados inactivos, transferencias hacia la misma persona y beneficiarios que
ya tengan una reservación propia o transferida para esa fecha. El endpoint
`GET /api/transfers/pending/:employeeCode` devuelve las reservaciones que todavía
pueden transferirse. `POST /api/transfers` realiza el movimiento y
`GET /api/transfers` devuelve el historial. Los tres endpoints aceptan una
sesión activa de Administrador o Recursos Humanos y rechazan al rol Chef.

### Consulta mensual para empleados

La página pública `Consulta` permite ingresar un código de empleado y seleccionar
el mes actual o cualquier mes anterior. La API rechaza meses futuros aunque se
intente omitir la restricción del selector del portal.

Cuando no existe una sesión activa, `Consulta` es la pantalla inicial del portal;
`Iniciar sesión` sigue disponible en el menú para el personal autorizado. La
gráfica semanal utiliza exclusivamente rangos laborales de lunes a viernes. No
crea columnas para sábados o domingos y las reservaciones de fin de semana no se
suman a las barras, aunque el total mensual conserva todos los registros.

`GET /api/consultations/employees/:employeeCode/monthly?month=YYYY-MM` devuelve
solamente código, nombre y datos de almuerzos; no expone correo, departamento,
huellas ni información de acceso. El resultado incluye:

- total de almuerzos reservados en el mes
- total entregado y pendiente
- agrupación por semanas de lunes a domingo
- fecha, nombre, cantidad, estado y hora de entrega de cada almuerzo

Un almuerzo se considera entregado cuando la reservación tiene una solicitud
`APPROVED`; de lo contrario aparece pendiente. Los meses sin movimientos se
muestran con totales en cero y una tabla vacía.

El administrador puede crear únicamente cuentas `RH` y `CHEF`, cambiar sus
contraseñas y activarlas o desactivarlas. Estas operaciones dejan una entrada en
`audit_logs` sin almacenar contraseñas ni hashes en el detalle del log.

`AUTH_JWT_SECRET` debe contener un secreto aleatorio de al menos 32 caracteres.
En producción, el portal y la API deben publicarse con HTTPS para que la cookie
también use el atributo `Secure`.

## Entregas e historico

- `GET /api/meals/today`: entregas e intentos del dia actual.
- `GET /api/meals/history`: ultimos 200 registros historicos.
- `GET /api/meals/pending-today`: reservas de hoy que todavia no tienen una
  entrega `APPROVED`.
- `GET /api/meals/summary/today`: conteos de reservadas, retiradas, pendientes
  e intentos duplicados.

Ambas rutas incluyen hora, codigo y nombre del empleado, comida reservada,
fecha y estado. La opcion **Entregas** de React permite alternar entre hoy y el
historico. No incluye reportes avanzados.

El resumen diario usa estas definiciones:

- `reserved`: reservas existentes para hoy.
- `collected`: reservas relacionadas con una entrega `APPROVED`.
- `pending`: reservas sin entrega aprobada.
- `duplicateAttempts`: filas `DUPLICATE` registradas hoy.

Estas consultas son de solo lectura y no modifican las reservas.

## Pruebas automaticas

```bash
pnpm test
```

Las pruebas cubren aprobacion, duplicado, ausencia de reserva, empleado inactivo,
dos solicitudes simultaneas, pendientes y resumen diario. Utilizan SQL Server
real, verifican los registros guardados y eliminan sus datos temporales al
finalizar.

## Comandos utiles

```bash
pnpm dev:web
pnpm dev:api
pnpm build
pnpm test
pnpm db:seed
pnpm db:validate
pnpm db:deploy
pnpm db:status
pnpm db:studio
```

Para crear una nueva migracion despues de modificar el esquema:

```bash
pnpm db:migrate -- --name descripcion_del_cambio
```

`db:migrate` es para crear migraciones durante desarrollo. Para aplicar
migraciones ya creadas sobre `MarcaDBtest`, utiliza `pnpm db:deploy`.

El sistema ya incluye enrolamiento real, almacenamiento cifrado, identificación 1:N y
entrega de comida desde el kiosco. El envío de correos, la autenticación administrativa,
los roles y las políticas operativas de producción continúan pendientes.


vamos a hacer una implementacion de logeo, en el cual vamos a tener lo que son diferetenes Usuarios, asi que vamos a generar una tablade usuarios en la cual
van a existir los sigueintes ( Admin, RH, Chef, y sin logeo)
