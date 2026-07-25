export interface DepartmentItem {
  department_id?: string | null;
  department_name?: string | null;
  department_color?: string | null;
}

export function getDepartmentBadgeColors(colorHex?: string | null) {
  const baseColor = colorHex || "#1565C0";
  let textDotColor = "#0D47A1";
  let dotColor = "#1565C0";
  let bg = "#E3F2FD";
  let border = "#90CAF9";

  if (baseColor.startsWith("#") && baseColor.length === 7) {
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    if (brightness > 130) {
      // Darken RGB for high-contrast crisp dark text on light background
      const dr = Math.floor(r * 0.35);
      const dg = Math.floor(g * 0.35);
      const db = Math.floor(b * 0.35);
      textDotColor = `rgb(${dr}, ${dg}, ${db})`;

      // Solid vibrant dot (darkened for strong visibility)
      const dotR = Math.floor(r * 0.55);
      const dotG = Math.floor(g * 0.55);
      const dotB = Math.floor(b * 0.55);
      dotColor = `rgb(${dotR}, ${dotG}, ${dotB})`;

      // Soft background tint (25% opacity) & crisp border
      bg = `rgba(${r}, ${g}, ${b}, 0.25)`;
      border = `rgba(${dotR}, ${dotG}, ${dotB}, 0.45)`;
    } else {
      textDotColor = baseColor;
      dotColor = baseColor;
      bg = baseColor + "20";
      border = baseColor + "60";
    }
  }

  return { bg, border, dot: dotColor, text: textDotColor };
}

export function resolveUserDepartments(userObj: any): DepartmentItem[] {
  if (!userObj) return [];
  if (Array.isArray(userObj.departments) && userObj.departments.length > 0) {
    return userObj.departments.filter(
      (d: any) => d && (d.department_name || d.department_id)
    );
  }
  if (userObj.department_name || userObj.department_id) {
    return [
      {
        department_id: userObj.department_id,
        department_name: userObj.department_name,
        department_color: userObj.department_color,
      },
    ];
  }
  return [];
}
