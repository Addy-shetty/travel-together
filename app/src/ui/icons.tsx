import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';

type IconProps = { size?: number; color?: ColorValue; strokeWidth?: number };

/** Two map pins side by side: the Travel-Together mark. */
export function LogoMark({ size = 64, color = colors.primary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth={3.2}
      strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
      <Path d="M17 40s-10-8.6-10-16a10 10 0 0 1 20 0" />
      <Circle cx={17} cy={23} r={3.5} />
      <Path d="M31 40s10-8.6 10-16a10 10 0 0 0-20 0" />
      <Circle cx={31} cy={23} r={3.5} />
    </Svg>
  );
}

function Stroke({ size = 22, color = colors.ink, strokeWidth = 2, d }: IconProps & { d: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      <Path d={d} />
    </Svg>
  );
}

export const HomeIcon = (p: IconProps) => <Stroke {...p} d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />;
export const PinIcon = (p: IconProps) => <Stroke {...p} d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />;
export const WalletIcon = (p: IconProps) => <Stroke {...p} d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7zM16.5 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />;
export const UserIcon = (p: IconProps) => <Stroke {...p} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />;
export const PlusIcon = (p: IconProps) => <Stroke {...p} d="M12 5v14M5 12h14" />;
export const BellIcon = (p: IconProps) => <Stroke {...p} d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />;
export const ShareIcon = (p: IconProps) => <Stroke {...p} d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6" />;
export const ChevronIcon = (p: IconProps) => <Stroke {...p} d="M9 6l6 6-6 6" />;
export const BackIcon = (p: IconProps) => <Stroke {...p} d="M19 12H5M11 6l-6 6 6 6" />;
export const CloseIcon = (p: IconProps) => <Stroke {...p} d="M6 6l12 12M18 6L6 18" />;
export const CheckIcon = (p: IconProps) => <Stroke {...p} d="M5 12l5 5L20 7" />;
export const CameraIcon = (p: IconProps) => <Stroke {...p} d="M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />;
