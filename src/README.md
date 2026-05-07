# Frontend Source Folders

This folder is the React frontend of the project.

## Main folders

- `components`: reusable UI pieces such as buttons, filters, dialogs, navigation, and profile widgets.
- `pages`: route pages for member, staff, admin, and login.
- `services`: frontend data calls and callable API wrappers.
- `utils`: small helper functions for dates, status text, errors, and display.
- `provider`: Firebase setup and login context.
- `constants`: shared route names and fixed values.
- `images`: image assets used by pages.
- `data`: exported Firebase data used for local checking.

## Simple rule

- Pages should call `services` to get or save data.
- Shared UI should stay in `components`.
- Small pure helpers should stay in `utils`.
