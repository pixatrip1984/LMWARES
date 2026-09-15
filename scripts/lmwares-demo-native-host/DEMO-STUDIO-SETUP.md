# Demo Studio: activación local

1. Ejecuta `start-brave-demo-studio.ps1` una vez. Inicia sesión en ChatGPT en
   el perfil aislado que abre Brave.
2. En `brave://extensions`, activa modo de desarrollador y carga la carpeta
   `C:\dev\lmwares\lmwares-chatgpt-demo-runner`.
3. Copia el identificador que Brave muestra para la extensión descargada.
4. Ejecuta `register-demo-studio-native-host.ps1 -ExtensionId <id>`.

El bridge revela el `runId` y el manifiesto creativo público que el runner deja
en `C:\dev\lmwares-demos\control\active-run.json`. Tokens, secretos, datos
de contacto y rutas de proyectos no cruzan hacia la extensión.

La extensión inicia el chat, envía el saludo, espera un identificador de
conversación, recarga y confirma que regresó al mismo chat. Si el login, MFA o
la interfaz de ChatGPT requieren intervención, se detiene en `attention`.
