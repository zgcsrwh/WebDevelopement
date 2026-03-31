# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

(1) 本地目录打开SHELL
(2) npm install
(3) npm run dev 

_______________________________________________________________________________________________________________________________________________
## 2026.3.30-31 更新
  (1) src/pages中增加LoginRegister.jsx作为登录首页，App.jsx的导航页修改为LoginRegister
  (2) 登录页的使用部件新增src/components/LoginRegister中的‘Carousel.jsx’,‘InitFooter.jsx’,‘LoginForm.jsx’,‘RegisterForm.jsx’文件，并添加LoginRegister.moudle.css样式文件
  (3) 新增src/provider/Authcontext和src/provider/DatabaseScheme文件, 补充FirebaseFunc功能以及新增使用说明README.md
  (4) 数据库生成工具Tools/FirestoreDataManager新增使用说明, 并修复部分问题。
