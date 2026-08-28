# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-08-28

### Fixed

- Localized the kiosk URL configuration description through the provider strings catalog.
- Hardened local development setup when the expected Music Assistant checkout path is occupied.

## [0.1.0] - 2026-08-25

### Added

- Standalone Web Kiosk player provider: turn any browser into a fullscreen Music Assistant kiosk player.
- HTML5 playback through the Music Assistant streamserver with WebSocket push control.
- Library browsing, search, and playback control through Music Assistant's native JSON-RPC and WebSocket APIs.
- Fullscreen kiosk overlays: visualizer, synced lyrics, party QR code, and queue display.
- Kiosk URL builder on the status dashboard and a copyable kiosk URL config entry.
- Sendspin multiroom sync via a web-kiosk bridge role with automatic HTTP fallback.
