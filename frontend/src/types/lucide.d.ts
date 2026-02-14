declare module 'lucide-react' {
    import { FC, SVGProps } from 'react';
    export interface IconProps extends SVGProps<SVGSVGElement> {
        size?: string | number;
        color?: string;
        strokeWidth?: string | number;
    }
    export type LucideIcon = FC<IconProps>;

    export const Eye: LucideIcon;
    export const Pencil: LucideIcon;
    export const Trash2: LucideIcon;
    export const Mail: LucideIcon;
    export const Filter: LucideIcon;
    export const Save: LucideIcon;
    export const RotateCcw: LucideIcon;
    export const Monitor: LucideIcon;
    export const ChevronLeft: LucideIcon;
    export const ChevronRight: LucideIcon;
    export const ChevronDown: LucideIcon;
    export const ChevronUp: LucideIcon;
    export const LayoutDashboard: LucideIcon;
    export const Share2: LucideIcon;
    export const Plus: LucideIcon;
    export const Download: LucideIcon;
    export const Maximize: LucideIcon;
    export const Maximize2: LucideIcon;
    export const Minimize: LucideIcon;
    export const Info: LucideIcon;
    export const Trash: LucideIcon;
    export const Edit: LucideIcon;
    export const X: LucideIcon;
    export const Calendar: LucideIcon;
    export const TrendingUp: LucideIcon;
    export const Wallet: LucideIcon;
    export const Receipt: LucideIcon;
    export const Users: LucideIcon;
    export const FileText: LucideIcon;
    export const MoreHorizontal: LucideIcon;
    export const Search: LucideIcon;
    export const Settings: LucideIcon;
    export const User: LucideIcon;
    export const Home: LucideIcon;
    export const ArrowRight: LucideIcon;
    export const ArrowLeft: LucideIcon;
    export const Check: LucideIcon;
    export const ExternalLink: LucideIcon;
    export const AlertCircle: LucideIcon;
    export const Bell: LucideIcon;
    export const Clock: LucideIcon;
    export const DollarSign: LucideIcon;
    export const PieChart: LucideIcon;
    export const BarChart: LucideIcon;
}
