'use client';

// Logo de WeWork recreado como SVG (circulo + "we" en serif), para no depender
// de subir un archivo. Toma el color de `currentColor`, asi se adapta al tema:
// negro en modo claro, claro en modo oscuro.
export default function WeWorkLogo({ size = 40, title = 'WeWork' }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            role="img"
            aria-label={title}
            style={{ display: 'block', color: 'currentColor' }}
        >
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="5" />
            <text
                x="50"
                y="50"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="Georgia, 'Times New Roman', serif"
                fontWeight="700"
                fontStyle="italic"
                fontSize="44"
                fill="currentColor"
            >
                we
            </text>
        </svg>
    );
}
