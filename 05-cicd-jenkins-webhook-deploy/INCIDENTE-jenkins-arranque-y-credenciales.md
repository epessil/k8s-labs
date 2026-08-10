# Incidente: Jenkins caído + credenciales perdidas + ID de credencial equivocado

**Fecha:** 10 de agosto de 2026
**Componente:** Jenkins (contenedor Docker), pipeline `mi-app-ci`
**Severidad:** Laboratorio — bloqueó el avance hasta resolverse, sin impacto productivo

## Síntoma

Tres fallos distintos, todos con el mismo denominador: Jenkins no dejaba avanzar la Semana 14 (webhook + CD a Kubernetes) hasta ponerlo operativo de verdad, no solo "corriendo".

1. `ERR_CONNECTION_REFUSED` al entrar a `localhost:8080`.
2. Ya con Jenkins arriba, la contraseña de administrador guardada en un `.txt` se había extraviado.
3. Días después, con el pipeline ya armado, la etapa `Push` fallaba con `ERROR: Could not find credentials entry with ID 'dockerhub-creds'`.

## Diagnóstico

**Fallo 1 — contenedor caído:**
```
docker ps -a
```
Mostró el contenedor `jenkins` en `Exited (255)`. Primer intento de reactivarlo:
```
docker start jenkins-docker   # Error response from daemon: No such container
```
Ese nombre corresponde a la **imagen** (`jenkins-docker:1.0`), no al contenedor. `docker ps -a` ya traía el nombre correcto en la columna `NAMES` (`jenkins`), pero la tabla se cortó por el ancho de la terminal y no se leyó completa.

**Fallo 2 — credencial perdida:**
```
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
# cat: ...: No such file or directory
```
Ese archivo se borra automáticamente al completar el asistente de configuración inicial — su ausencia confirmó que el setup ya se había completado antes (con un usuario propio), no que faltara un paso.

**Fallo 3 — credencial de Docker Hub con ID equivocado:**
El Jenkinsfile referenciaba `credentialsId: 'dockerhub-creds'`. En Jenkins → Manage Jenkins → Credentials, la credencial real existía como `dockerhub-flacuss74` — un ID distinto al asumido al escribir el Jenkinsfile.

## Causa raíz

- **Fallo 1:** confusión entre nombre de *imagen* Docker y nombre de *contenedor* — son identificadores independientes y no intercambiables. Además, el puerto real mapeado era `8081`, no el `8080` supuesto por defecto.
- **Fallo 2:** la contraseña de administrador nunca se respaldó en un gestor de credenciales, solo en un archivo de texto suelto que se perdió.
- **Fallo 3:** el ID de credencial se escribió de memoria/por convención al redactar el Jenkinsfile, sin confirmarlo contra lo que realmente existía configurado en Jenkins.

Patrón común a los tres: **actuar sobre un nombre asumido en vez de uno verificado.**

## Fix

**Fallo 1:**
```bash
docker start jenkins            # nombre correcto del contenedor
# acceso por el puerto real:
# http://localhost:8081
```

**Fallo 2** — reset de credencial vía script de arranque de Jenkins:
```bash
docker exec -it -u root jenkins bash
mkdir -p /var/jenkins_home/init.groovy.d
cat > /var/jenkins_home/init.groovy.d/basic-security.groovy << 'EOF'
#!groovy
import jenkins.model.*
import hudson.security.*

def instance = Jenkins.getInstance()
def hudsonRealm = new HudsonPrivateSecurityRealm(false)
hudsonRealm.createAccount("admin", "<password-nueva>")
instance.setSecurityRealm(hudsonRealm)
instance.save()
EOF
exit
docker restart jenkins
```
Tras confirmar el login, el script se eliminó del contenedor para no dejar la password en texto plano:
```bash
docker exec jenkins rm /var/jenkins_home/init.groovy.d/basic-security.groovy
```

**Fallo 3** — ajuste del Jenkinsfile al ID real, en vez de crear una credencial duplicada:
```groovy
withCredentials([usernamePassword(credentialsId: 'dockerhub-flacuss74', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
    sh 'echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin'
    sh 'docker push ${IMAGE_NAME}:${IMAGE_TAG}'
}
```

## Verificación

- `docker ps` mostrando `jenkins` en estado `Up`, accesible en `http://localhost:8081`.
- Login exitoso con el usuario `admin` y la password reseteada; script de credenciales confirmado como borrado del contenedor.
- Build de Jenkins con la etapa `Push` en verde tras el ajuste del `credentialsId`, confirmado en el Console Output sin el error `Could not find credentials entry`.

## Lección

Nombre de imagen, nombre de contenedor e ID de credencial son tres identificadores independientes que **no se pueden asumir de memoria** — cada uno se verifica con su propio comando (`docker ps -a`, `docker images`, Jenkins → Credentials) antes de escribirlo en código de automatización. Las credenciales de administración (passwords, tokens) deben vivir en un gestor dedicado desde el primer día, no en un archivo de texto suelto — perderlo cuesta un ciclo completo de reset, evitable con el hábito correcto desde el inicio.
