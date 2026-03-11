import React from 'react';
import Svg, { Path } from 'react-native-svg';

export default function ImplantIcon({
  size = 28,
  color = '#000',
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      {/* Crown */}
      <Path
        d="M110,150 C110,90 190,70 256,110 C322,70 402,90 402,150 L380,200 L132,200 Z"
        stroke={color}
        strokeWidth={28}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="transparent"
      />
      {/* Abutment */}
      <Path
        d="M160,200 L352,200 L320,260 L192,260 Z"
        stroke={color}
        strokeWidth={28}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="transparent"
      />
      {/* Implant Body */}
      <Path
        d="M256,260 L256,420"
        stroke={color}
        strokeWidth={28}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="transparent"
      />
      {/* Thread 1 */}
      <Path d="M180,300 L332,300" stroke={color} strokeWidth={28} strokeLinecap="round" />
      {/* Thread 2 */}
      <Path d="M180,350 L332,350" stroke={color} strokeWidth={28} strokeLinecap="round" />
      {/* Thread 3 */}
      <Path d="M180,400 L332,400" stroke={color} strokeWidth={28} strokeLinecap="round" />
    </Svg>
  );
}
