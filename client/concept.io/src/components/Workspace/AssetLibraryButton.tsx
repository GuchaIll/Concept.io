interface AssetLibraryButtonProps {
  onClick?: () => void;
}

export const AssetLibraryButton = ({ onClick }: AssetLibraryButtonProps) => {
  return (
    <div
      onClick={onClick}
      className="absolute bottom-6 right-6 w-14 h-14 glass-panel rounded-full thin-border flex items-center justify-center shadow-xl hover:scale-105 transition-transform cursor-pointer z-30"
    >
      <span className="material-icons-round text-white/60">grid_view</span>
    </div>
  );
};
