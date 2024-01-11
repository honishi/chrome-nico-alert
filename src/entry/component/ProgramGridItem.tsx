import React from "react";
import { Program } from "../../domain/model/program";

export default function ProgramGridItem(props: {
  program: Program;
  elapsedTime: string;
  rank?: number;
}) {
  const onClick = async function () {
    console.log("onclick");
    await chrome.tabs.create({ active: true, url: props.program.watchPageUrl });
  };
  const rankElement = (() => {
    if (props.rank == null) {
      return <></>;
    }
    const className = ["rank-number", props.rank > 5 ? null : `top-rank-${props.rank}`]
      .filter((name) => name != null)
      .join(" ");
    return <span className={className}>{props.rank.toString()}</span>;
  })();
  const programImageSrc =
    props.program.listingThumbnail ??
    props.program.screenshotThumbnail.liveScreenshotThumbnailUrl ??
    props.program.socialGroup.thumbnailUrl;
  const title = [props.program.isFollowerOnly ? "【限】" : "", props.program.title].join(" ");
  const userImageSrc =
    props.program.programProvider?.iconSmall ?? props.program.socialGroup.thumbnailUrl;
  const userName = props.program.programProvider?.name ?? props.program.socialGroup.name;
  return (
    <div className="grid-item">
      {rankElement}
      <a href={props.program.watchPageUrl} onClick={onClick}>
        <img src={programImageSrc} alt="" />
        <span className="elapsed-time">{"⏱️" + props.elapsedTime}</span>
        <span className="title-span">{title}</span>
        <div className="user-div">
          <img src={userImageSrc} alt="" />
          <span>{userName}</span>
        </div>
      </a>
    </div>
  );
}
