// A small fake React app with four circular dependencies planted in it.
//   1. Header ↔ UserMenu
//   2. Sidebar → NavItem → Tooltip → Sidebar
//   3. AuthContext ↔ useAuth
//   4. api → store → userSlice → api

export const sampleProject = {
  'src/index.jsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')).render(<App />);
`,
  'src/App.jsx': `import React from 'react';
import Layout from './components/Layout';
import Router from './routes/Router';
import { AuthProvider } from './context/AuthContext';
import { store } from './store/store';

export default function App() {
  return (
    <AuthProvider>
      <Layout><Router store={store} /></Layout>
    </AuthProvider>
  );
}
`,
  'src/components/Layout.jsx': `import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

export default function Layout({ children }) {
  return <div className="layout"><Header /><Sidebar /><main>{children}</main><Footer /></div>;
}
`,
  'src/components/Header.jsx': `import UserMenu from './UserMenu';
import { useAuth } from '../hooks/useAuth';

export const HEADER_HEIGHT = 64;

export default function Header() {
  const { user } = useAuth();
  return <header><h1>Shop</h1><UserMenu user={user} /></header>;
}
`,
  'src/components/UserMenu.jsx': `import Avatar from './Avatar';
import { HEADER_HEIGHT } from './Header'; // ⚠ cycle: Header imports UserMenu

export default function UserMenu({ user }) {
  return <div style={{ top: HEADER_HEIGHT }}><Avatar src={user?.photo} /></div>;
}
`,
  'src/components/Avatar.jsx': `export default function Avatar({ src }) {
  return <img className="avatar" src={src} alt="" />;
}
`,
  'src/components/Sidebar.jsx': `import NavItem from './NavItem';

export const SIDEBAR_WIDTH = 240;

export default function Sidebar() {
  return <nav>{['Home', 'Profile'].map((l) => <NavItem key={l} label={l} />)}</nav>;
}
`,
  'src/components/NavItem.jsx': `import Tooltip from './Tooltip';

export default function NavItem({ label }) {
  return <Tooltip text={label}><a>{label}</a></Tooltip>;
}
`,
  'src/components/Tooltip.jsx': `import { SIDEBAR_WIDTH } from './Sidebar'; // ⚠ closes Sidebar → NavItem → Tooltip loop

export default function Tooltip({ text, children }) {
  return <span title={text} style={{ maxWidth: SIDEBAR_WIDTH }}>{children}</span>;
}
`,
  'src/components/Footer.jsx': `import Button from './ui/Button';

export default function Footer() {
  return <footer><Button>Contact</Button></footer>;
}
`,
  'src/components/ui/Button.jsx': `export default function Button({ children, ...rest }) {
  return <button {...rest}>{children}</button>;
}
`,
  'src/components/ProductCard.jsx': `import Button from './ui/Button';
import { formatPrice } from '../utils/format';

export default function ProductCard({ product }) {
  return <div><h3>{product.name}</h3><p>{formatPrice(product.price)}</p><Button>Add</Button></div>;
}
`,
  'src/context/AuthContext.jsx': `import { createContext, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth'; // ⚠ cycle: useAuth imports AuthContext

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  return <AuthContext.Provider value={{ user, login: () => api.login().then(setUser) }}>{children}</AuthContext.Provider>;
}

export function DebugAuth() {
  const auth = useAuth();
  return <pre>{JSON.stringify(auth)}</pre>;
}
`,
  'src/hooks/useAuth.js': `import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export function useAuth() {
  return useContext(AuthContext);
}
`,
  'src/services/api.js': `import { http } from '../utils/http';
import { store } from '../store/store'; // ⚠ api → store → userSlice → api

export const api = {
  login: () => http.post('/login').then((u) => { store.dispatch({ type: 'user/set', u }); return u; }),
  products: () => http.get('/products'),
};
`,
  'src/store/store.js': `import { userReducer } from './userSlice';
import { cartReducer } from './cartSlice';

export const store = createStore({ user: userReducer, cart: cartReducer });
`,
  'src/store/userSlice.js': `import { api } from '../services/api';

export function userReducer(state = null, action) {
  if (action.type === 'user/refresh') api.login();
  return action.type === 'user/set' ? action.u : state;
}
`,
  'src/store/cartSlice.js': `import { formatPrice } from '../utils/format';

export function cartReducer(state = [], action) {
  return action.type === 'cart/add' ? [...state, action.item] : state;
}
export const total = (items) => formatPrice(items.reduce((s, i) => s + i.price, 0));
`,
  'src/utils/http.js': `import { formatError } from './format';

export const http = {
  get: (url) => fetch(url).then((r) => r.json()).catch(formatError),
  post: (url) => fetch(url, { method: 'POST' }).then((r) => r.json()).catch(formatError),
};
`,
  'src/utils/format.js': `export const formatPrice = (n) => '$' + n.toFixed(2);
export const formatError = (e) => ({ error: String(e) });
`,
  'src/routes/Router.jsx': `import { lazy } from 'react';
import Home from '../pages/Home';
const Profile = lazy(() => import('../pages/Profile'));

export default function Router() {
  return location.pathname === '/profile' ? <Profile /> : <Home />;
}
`,
  'src/pages/Home.jsx': `import ProductCard from '../components/ProductCard';
import { api } from '../services/api';

export default function Home() {
  return <section>{[].map((p) => <ProductCard key={p.id} product={p} />)}</section>;
}
`,
  'src/pages/Profile.jsx': `import Avatar from '../components/Avatar';
import { useAuth } from '../hooks/useAuth';

export default function Profile() {
  const { user } = useAuth();
  return <section><Avatar src={user?.photo} /><h2>{user?.name}</h2></section>;
}
`,
};
