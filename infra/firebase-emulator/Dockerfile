# The Auth Emulator is a Java program driven by the Node-based Firebase CLI, so the image needs
# both. eclipse-temurin ships the JRE; Node 22 comes from the distro-independent tarball so the
# version matches the repo's engines field.
FROM eclipse-temurin:17-jre

ARG NODE_VERSION=22.14.0
ARG FIREBASE_TOOLS_VERSION=14.24.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
  && rm -rf /var/lib/apt/lists/*

# The tarball is per-architecture: pick it from the build platform so the image builds on both
# Apple Silicon (arm64) and x86_64 hosts.
RUN set -eux; \
  case "$(uname -m)" in \
    x86_64) NODE_ARCH=x64 ;; \
    aarch64|arm64) NODE_ARCH=arm64 ;; \
    *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 --exclude CHANGELOG.md --exclude LICENSE --exclude README.md

RUN npm install -g "firebase-tools@${FIREBASE_TOOLS_VERSION}"

WORKDIR /srv
COPY firebase.json .firebaserc ./

EXPOSE 9099
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "skinny-legend"]
