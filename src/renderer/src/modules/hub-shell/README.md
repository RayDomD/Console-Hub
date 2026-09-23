# hub-shell

Renders the Console Hub surface: its Explorer-first sidebar, Recipe chooser, and return control.

## Public interface

- `HubShell` renders the surface and its rest-state entrance.

## What it does not handle

- Recipe execution or the run plate.
- Reading workspace directories in main.
- The Live Stack, console dock, or command bar.

## Dependencies

React, plate layout, recipe selection, and the frozen fan and workspace preload APIs.
