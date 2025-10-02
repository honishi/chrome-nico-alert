import React from "react";
import ProgramGridItem from "./ProgramGridItem";
import { Program } from "../../domain/model/program";
import { Popup } from "../../domain/usecase/popup";
import { useSticky } from "../hooks/useSticky";

interface RankingProgramsProps {
  programs: Program[];
  popup: Popup;
  showComponent: boolean;
}

const RankingPrograms: React.FC<RankingProgramsProps> = ({ programs, popup, showComponent }) => {
  if (!showComponent) {
    return null;
  }

  const { sentinelRef, stickyRef, isSticky } = useSticky<HTMLDivElement>();

  return (
    <div className="section-container">
      <div ref={sentinelRef} style={{ height: "1px", width: "100%", pointerEvents: "none" }} />
      <div
        ref={stickyRef}
        className={`section-title-container${isSticky ? " section-title-container-sticky" : ""}`}
        style={{ zIndex: 10 }}
      >
        <span className="section-title"> ランキング </span>
      </div>
      <div className="grid-container">
        {programs.map((p, index) => {
          const elapsed = popup.toElapsedTime(p);
          const rank = index + 1;
          return <ProgramGridItem program={p} elapsedTime={elapsed} rank={rank} key={p.id} />;
        })}
      </div>
    </div>
  );
};

export default RankingPrograms;
