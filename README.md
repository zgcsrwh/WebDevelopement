# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Run Guidance

Environment requires node 24。

(1) Open cmd in directory

(2) npm install

(3) npm run dev 

_______________________________________________________________________________________________________________________________________________
## 2026.3.30-31 Update
  (1) Adding LoginRegister.jsx in src/pages as the first page，the route in App.jsx changed as LoginRegister
  
  (2) Adding src/components/LoginRegister : ‘Carousel.jsx’,‘InitFooter.jsx’,‘LoginForm.jsx’,‘RegisterForm.jsx’文件，and LoginRegister.moudle.css

  (3) Adding src/provider/Authcontextand src/provider/DatabaseScheme files, supplement with FirebaseFunc and README.md
  
  (4) Adding a database generation tool in Tools/FirestoreDataManager

_______________________________________________________________________________________________________________________________________________
## 2026.4.27 Update

  (1) Merge the code from branch into main branch, and deciding this version as V1.0.

  (2) Adjust the registration process from two steps intp one step.

  (3) Add the interface of google account sign in / sign up
  
  (4) Add description for the slide images. 