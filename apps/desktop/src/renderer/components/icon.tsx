export type IconName='brand'|'folder'|'plus'|'settings'|'stop'|'changes'|'close'|'send';
const paths:Record<IconName,string>={brand:'M19 4H8L3 9v11h11l6-6M11 9h9v11M8 14h5',folder:'M3 7V5h6l2 3h10v12H3V7Zm0 3h18',plus:'M12 4v16M4 12h16',settings:'M4 7h16M4 17h16M9 4v6M16 14v6',stop:'M6 6h12v12H6Z',changes:'M4 4h10l6 6v10H4ZM14 4v6h6M7 14h10M7 17h6',close:'m6 6 12 12M18 6 6 18',send:'M4 12h15M13 5l7 7-7 7'};
export function Icon({name}:{name:IconName}){return <svg viewBox="0 0 24 24" aria-hidden="true" className="icon"><path d={paths[name]}/></svg>;}
