import type {ReactNode} from 'react';
import './style.css';
export const metadata = {title: 'Law Machine', description: 'Explore the rules. Follow what happens.'};
export default function Layout({children}: {children: ReactNode}) {return <html lang="en"><body><a className="skip" href="#main">Skip to content</a>{children}</body></html>;}
