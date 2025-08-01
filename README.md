# Plex-Trakt CLI

CLI simple para sincronizar tu actividad de Plex con Trakt.tv automáticamente.

## ¿Qué hace?

- 🎬 Sincroniza automáticamente lo que ves en Plex con tu cuenta de Trakt.tv
- 📺 Funciona con series y películas
- 🔄 Scrobbling en tiempo real (play, pause, stop)
- 👤 Filtros de usuario (solo tú o usuarios específicos)
- 🔧 CLI simple sin interfaz web

## Instalación

1. Clona o descarga el proyecto
2. Instala dependencias:
```bash
npm install
```

3. Crea tu archivo `.env` con tu configuración:
```bash
cp .env.example .env
```

## Configuración

### 1. Obtener credenciales de Trakt.tv

1. Ve a https://trakt.tv/oauth/applications
2. Crea una nueva aplicación
3. Usa esta URL de redirect: `http://localhost:3000/callback`
4. Copia tu Client ID y Client Secret

### 2. Configurar .env

```env
# Credenciales de Trakt.tv (OBLIGATORIOS)
TRAKT_CLIENT_ID=tu_client_id_aqui
TRAKT_CLIENT_SECRET=tu_client_secret_aqui

# Puerto para el webhook (opcional, por defecto 3000)
WEBHOOK_PORT=3000

# URL base para webhooks (opcional, se auto-detecta)
WEBHOOK_BASE_URL=http://localhost:3000

# Filtros de usuario (elige UNA opción):

# Opción 1: Solo el propietario del servidor Plex
PLEX_OWNER_ONLY=true

# Opción 2: Lista de nombres de usuario permitidos
PLEX_ALLOWED_USERS=Tu Nombre,Otro Usuario

# Opción 3: Lista de IDs de usuario (más seguro)
PLEX_ALLOWED_USER_IDS=12345,67890
```

## Uso

### 1. Autenticarse con Trakt.tv

```bash
npm run auth
```

- Se abrirá tu navegador
- Autoriza la aplicación en Trakt.tv
- Vuelve a la terminal cuando veas "Authentication Successful"

### 2. Iniciar el listener de webhooks

```bash
npm run listen
```

- Mantén esta terminal abierta
- La app escuchará webhooks de Plex en el puerto 3000

### 3. Configurar Plex

1. Ve a **Plex Web → Configuración → Webhooks**
2. Haz clic en **"+"** para agregar un nuevo webhook  
3. Pega esta URL: `http://localhost:3000/webhook`
4. Guarda

### 4. ¡Pruébalo!

- Reproduce cualquier contenido en Plex
- Verás los logs en la terminal
- Revisa tu perfil de Trakt.tv para confirmar la sincronización

## Comandos Disponibles

```bash
# Mostrar ayuda
npm start
# o
node index.js help

# Autenticar con Trakt.tv
npm run auth
# o  
node index.js auth

# Iniciar listener de webhooks
npm run listen
# o
node index.js listen

# Ver estado de la conexión
node index.js status
```

## Cómo encontrar tu ID de usuario

Si quieres usar `PLEX_ALLOWED_USER_IDS`:

1. Ejecuta `npm run listen`
2. Reproduce algo en Plex
3. En la terminal verás algo como:
```
📡 Webhook recibido: {
  user: 'Tu Nombre',
  userId: '12345',
  ...
}
```
4. Usa ese `userId` en tu `.env`

## Troubleshooting

### "No valid Trakt token"
- Ejecuta `npm run auth` primero

### "Usuario no autorizado"
- Revisa tu configuración de filtros en `.env`
- Usa `node index.js status` para ver la configuración actual

### Webhook no funciona
- Verifica que Plex pueda acceder a `http://localhost:3000/webhook`
- Si usas Docker/red externa, cambia `WEBHOOK_BASE_URL` a tu IP pública

### Puerto ocupado
- Cambia `WEBHOOK_PORT` en `.env` a otro puerto (ej: 3001)
- Actualiza la URL en Plex accordingly

## Estructura del Proyecto

```
plex-trakt/
├── index.js           # Punto de entrada CLI
├── cli.js             # Lógica de comandos CLI  
├── webhookServer.js   # Servidor HTTP para webhooks
├── config.js          # Configuración y validación
├── tokenManager.js    # Manejo de tokens de Trakt
├── traktApi.js        # Funciones de la API de Trakt
├── userAuth.js        # Autorización de usuarios
├── webhookHandlers.js # Procesamiento de webhooks de Plex
└── .env               # Tu configuración
```

## Funcionalidades

- ✅ Scrobbling automático (play/pause/stop)
- ✅ Series y películas
- ✅ Búsqueda inteligente en Trakt
- ✅ Renovación automática de tokens
- ✅ Filtros de usuario flexibles
- ✅ Logs detallados para debugging
- ✅ CLI simple sin interfaz web

---

**¡Disfruta sincronizando tu contenido de Plex con Trakt.tv! 🎬**