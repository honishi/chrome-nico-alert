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
  function onProgramImageError(event: React.SyntheticEvent<HTMLImageElement>): void {
    const fallbackSrc = props.program.programProvider?.icon;
    const image = event.currentTarget;
    image.style.objectFit = "";
    if (fallbackSrc && image.getAttribute("src") !== fallbackSrc) {
      image.src = fallbackSrc;
    }
  }
  function onProgramImageLoad(event: React.SyntheticEvent<HTMLImageElement>): void {
    const image = event.currentTarget;
    const isFallback = image.getAttribute("src") !== programImageSrc;
    image.style.objectFit = isFallback ? "cover" : "";
  }
  const title = [props.program.isFollowerOnly ? "【限】" : "", props.program.title].join(" ");
  const userImageSrc =
    props.program.supplier?.icons?.uri150x150 ||
    props.program.programProvider?.iconSmall ||
    props.program.socialGroup.thumbnailUrl;
  const userName =
    props.program.supplier?.name ??
    props.program.programProvider?.name ??
    props.program.socialGroup.name;
  return (
    <div className="grid-item">
      {rankElement}
      <a href={props.program.watchPageUrl} onClick={onClick}>
        <img
          src={programImageSrc}
          onError={onProgramImageError}
          onLoad={onProgramImageLoad}
          alt=""
        />
        <span className="elapsed-time">
          <i className="fa-solid fa-clock"></i> {props.elapsedTime}
        </span>
        <span className="title-span">{title}</span>
        <div className="user-div">
          <img src={userImageSrc} alt="" />
          <span>{userName}</span>
        </div>
      </a>
    </div>
  );
}
