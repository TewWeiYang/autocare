import { Link } from 'react-router-dom';
import { BackIcon } from './Icons.jsx';

// Shared frame for the Login, Create Account and Forgot Password screens.
// `back` is where the arrow at the top goes (the start screen unless told otherwise).
export default function AuthLayout({ title, back = '/', children }) {
  return (
    <div className="screen">
      <header className="authhead">
        <h1>{title}</h1>
      </header>
      <main className="screen__body">
        <Link to={back} className="backlink" aria-label="Back"><BackIcon /></Link>
        {children}
      </main>
    </div>
  );
}
