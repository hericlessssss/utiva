// Valores dos <select> do Char Bazaar (tibia.com, formulário de filtros, out/2026).
// O backend repassa os códigos como estão para os params `filter_*` (§5 do planejamento).

export interface Option {
  value: string;
  label: string;
}

export const VOCATIONS: Option[] = [
  { value: '1', label: 'None' },
  { value: '2', label: 'Druid' },
  { value: '3', label: 'Knight' },
  { value: '4', label: 'Paladin' },
  { value: '5', label: 'Sorcerer' },
  { value: '6', label: 'Monk' },
];

export const SKILLS: Option[] = [
  { value: '1', label: 'Magic Level' },
  { value: '10', label: 'Axe' },
  { value: '9', label: 'Club' },
  { value: '7', label: 'Distance' },
  { value: '11', label: 'Fist' },
  { value: '6', label: 'Shielding' },
  { value: '8', label: 'Sword' },
  { value: '13', label: 'Fishing' },
];

export const PVP_TYPES: Option[] = [
  { value: '0', label: 'Open PvP' },
  { value: '1', label: 'Optional PvP' },
  { value: '2', label: 'Hardcore PvP' },
  { value: '3', label: 'Retro Open PvP' },
  { value: '4', label: 'Retro Hardcore PvP' },
];

export const BATTLEYE: Option[] = [
  { value: '1', label: 'Initially protected' },
  { value: '2', label: 'Protected' },
  { value: '3', label: 'Not protected' },
];

export const WORLDS = [
  'Antica', 'Astera', 'Belobra', 'Bona', 'Calmera', 'Celebra', 'Celesta', 'Collabra',
  'Descubra', 'Deslumbra', 'Dia', 'Dracobra', 'Eclipta', 'Epoca', 'Escura', 'Faunera',
  'Ferobra', 'Firmera', 'Floribra', 'Gentebra', 'Gladera', 'Harmonia', 'Havera', 'Honbra',
  'Hostera', 'Idyllia', 'Ignibra', 'Inabra', 'Issobra', 'Jadebra', 'Jambra', 'Jinxibra',
  'Junera', 'Kalanta', 'Kalibra', 'Kanda', 'Karmeya', 'Lobera', 'Luminera', 'Lutabra',
  'Maligna', 'Menera', 'Monstera', 'Monza', 'Mortabra', 'Mystera', 'Nefera', 'Nevia',
  'Nociva', 'Oceanis', 'Ombra', 'Opulera', 'Ourobra', 'Pacera', 'Peloria', 'Penumbra',
  'Premia', 'Quelibra', 'Quidera', 'Quintera', 'Rasteibra', 'Refugia', 'Retalia', 'Secura',
  'Serdebra', 'Sinistra', 'Solidera', 'Stralis', 'Talera', 'Tempestera', 'Terribra', 'Thyria',
  'Tornabra', 'Ulmyra', 'Unebra', 'Ustebra', 'Venebra', 'Victoris', 'Vunira', 'Westera',
  'Wickera', 'Wintera', 'Xyla', 'Yonabra', 'Yovera', 'Zuna', 'Zunera',
];

export function labelOf(options: Option[], value: string | null): string {
  if (value == null) return '';
  return options.find((o) => o.value === value)?.label ?? value;
}
