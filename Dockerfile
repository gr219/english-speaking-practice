# Stage 1: Build frontend with Node
FROM node:20-slim as frontend
WORKDIR /usr/src/app/frontend
COPY ./frontend/package*.json ./
RUN npm install
COPY ./frontend .
RUN npm run build
# Ensure public/lib files are in output (Vite publicDir)
RUN cp -r /usr/src/app/frontend/public/lib /usr/src/app/public/lib 2>/dev/null || true
# Output is in /usr/src/app/public (because vite.config.ts outDir is '../public')

# Stage 2: Build backend with Rust
FROM rust:latest as backend
COPY ./deps/libvosk.so /usr/local/lib/libvosk.so
RUN ldconfig
ENV LIBRARY_PATH=/usr/local/lib

WORKDIR /usr/src/app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY data ./data
# Build with caching for dependencies
RUN --mount=type=cache,target=/usr/local/cargo,from=rust:latest,source=/usr/local/cargo \
    --mount=type=cache,target=target \
    cargo build --release && mv ./target/release/speech-rs ./speech-rs

# Stage 3: Runtime image
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -ms /bin/bash app

USER root
WORKDIR /app

# Copy compiled backend binary
COPY --from=backend /usr/src/app/speech-rs /app/speech-rs
# Copy Vosk library
COPY --from=backend /usr/local/lib/libvosk.so /usr/local/lib/libvosk.so
# Copy Vosk model
COPY ./model /app/model
# Copy frontend build output
COPY --from=frontend /usr/src/app/public /app/public
# Copy WebAudioRecorder lib files (static assets needed at runtime)
COPY --from=frontend /usr/src/app/frontend/public/lib /app/public/lib
# Create directories for volumes
RUN mkdir -p /app/audio /app/data

# Update library cache and set ownership
RUN ldconfig && chown -R app:app /app
USER app

# Run the app
EXPOSE 3000
CMD ["./speech-rs"]