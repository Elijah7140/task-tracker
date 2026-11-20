import {
  BookOpen,
  Briefcase,
  ChartColumn,
  Clock,
  Cloud,
  Code,
  Cpu,
  Database,
  Factory,
  FileText,
  FlaskConical,
  Folder,
  Globe,
  GraduationCap,
  Hammer,
  Heart,
  Layers,
  Lightbulb,
  type LucideIcon,
  Mail,
  Rocket,
  Server,
  Shield,
  ShoppingCart,
  Ticket,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

/** One icon a project can show, by its stored key (§7.19). */
export interface ProjectIconChoice {
  readonly key: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** The icons a project can choose from, in picker order. Keys are stored, so never rename one. */
export const PROJECT_ICONS: ReadonlyArray<ProjectIconChoice> = [
  { key: "database", label: "Database", icon: Database },
  { key: "server", label: "Server", icon: Server },
  { key: "code", label: "Code", icon: Code },
  { key: "cpu", label: "Hardware", icon: Cpu },
  { key: "cloud", label: "Cloud", icon: Cloud },
  { key: "globe", label: "Web", icon: Globe },
  { key: "layers", label: "Layers", icon: Layers },
  { key: "shield", label: "Security", icon: Shield },
  { key: "chart", label: "Reports", icon: ChartColumn },
  { key: "ticket", label: "Tickets", icon: Ticket },
  { key: "clock", label: "Time", icon: Clock },
  { key: "users", label: "People", icon: Users },
  { key: "graduation", label: "Training", icon: GraduationCap },
  { key: "factory", label: "Plant", icon: Factory },
  { key: "truck", label: "Shipping", icon: Truck },
  { key: "cart", label: "Purchasing", icon: ShoppingCart },
  { key: "wrench", label: "Maintenance", icon: Wrench },
  { key: "hammer", label: "Build", icon: Hammer },
  { key: "flask", label: "Research", icon: FlaskConical },
  { key: "lightbulb", label: "Ideas", icon: Lightbulb },
  { key: "rocket", label: "Launch", icon: Rocket },
  { key: "briefcase", label: "Business", icon: Briefcase },
  { key: "book", label: "Docs", icon: BookOpen },
  { key: "file", label: "Files", icon: FileText },
  { key: "folder", label: "Folder", icon: Folder },
  { key: "mail", label: "Mail", icon: Mail },
  { key: "heart", label: "Personal", icon: Heart },
];

/** The icon for a stored key, or undefined for none or a key this build does not know. */
export function projectIconFor(key: string | null | undefined): ProjectIconChoice | undefined {
  return key === null || key === undefined
    ? undefined
    : PROJECT_ICONS.find((choice) => choice.key === key);
}
