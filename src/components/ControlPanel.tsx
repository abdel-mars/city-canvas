import { ArtworkSettings, ColorPreset, FontFamily, TextPosition } from '@/types/artwork';
import ColorPresets from './ColorPresets';
import TypographyControls from './TypographyControls';
import DownloadShare from './DownloadShare';

interface ControlPanelProps {
  settings: ArtworkSettings;
  onSettingsChange: (settings: ArtworkSettings) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
  cityName: string;
  hasRoads: boolean;
}

const ControlPanel = ({
  settings,
  onSettingsChange,
  svgRef,
  cityName,
  hasRoads,
}: ControlPanelProps) => {
  const update = (partial: Partial<ArtworkSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  return (
    <div className="space-y-6 p-6">
      <ColorPresets
        selected={settings.preset}
        onSelect={(preset: ColorPreset) => update({ preset })}
      />

      <div className="border-t border-border" />

      <TypographyControls
        font={settings.font}
        textPosition={settings.textPosition}
        customName={settings.customName}
        showCustomName={settings.showCustomName}
        onFontChange={(font: FontFamily) => update({ font })}
        onPositionChange={(textPosition: TextPosition) => update({ textPosition })}
        onCustomNameChange={(customName: string) => update({ customName })}
        onShowCustomNameChange={(showCustomName: boolean) => update({ showCustomName })}
      />

      {hasRoads && (
        <>
          <div className="border-t border-border" />
          <DownloadShare
            svgRef={svgRef}
            cityName={cityName}
            textColor={settings.preset.text}
          />
        </>
      )}
    </div>
  );
};

export default ControlPanel;
