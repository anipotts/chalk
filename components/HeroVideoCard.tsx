"use client";

import { useState } from "react";

// Shared SVG grain filter for card hover effect (rendered once, referenced by all cards)
const CARD_GRAIN_FILTER_ID = "card-grain";

export function CardGrainFilter() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <filter
          id={CARD_GRAIN_FILTER_ID}
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.55"
            numOctaves="3"
            seed="7"
            stitchTiles="stitch"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feComponentTransfer in="displaced">
            <feFuncR type="linear" slope="0.35" />
            <feFuncG type="linear" slope="0.35" />
            <feFuncB type="linear" slope="0.35" />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}

// Channel avatar URLs — 176px from YouTube CDN, CORS-enabled
const CHANNEL_AVATARS: Record<string, string> = {
  "3Blue1Brown":
    "https://yt3.ggpht.com/ytc/AIdro_nFzZFPLxPZRHcE3SSwzdrbuWqfoWYwLAu0_2iO6blQYAU=s176-c-k-c0x00ffffff-no-rj",
  "Andrej Karpathy":
    "https://yt3.ggpht.com/ytc/AIdro_nDvyq2NoPL626bk1IbxQ94SfQsD-B0qgZchghtQNkLWoEz=s176-c-k-c0x00ffffff-no-rj",
  Kurzgesagt:
    "https://yt3.ggpht.com/ytc/AIdro_n1Ribd7LwdP_qKtqWL3ZDfIgv9M1d6g78VwpHGXVR2Ir4=s176-c-k-c0x00ffffff-no-rj",
  "Freya Holmer":
    "https://yt3.ggpht.com/AHB_DOnLYaB2c1dGXjtAUaM9h8ReaGWlJ3Wg_dI8gCXzBT8h0hP_3H-ZSkSHTFsDF7KA108MnV0=s176-c-k-c0x00ffffff-no-rj",
  StatQuest:
    "https://yt3.googleusercontent.com/Lzc9YzCKTkcA1My5A5pbsqaEtOoGc0ncWpCJiOQs2-0win3Tjf5XxmDFEYUiVM9jOTuhMjGs=s176-c-k-c0x00ffffff-no-rj",
  SmarterEveryDay:
    "https://yt3.ggpht.com/ytc/AIdro_l59Ewmp0DHZBRWbY9dVqjd2_mWwvrn8ad0bJfmdbMRYcA=s176-c-k-c0x00ffffff-no-rj",
  Numberphile:
    "https://yt3.ggpht.com/ytc/AIdro_nmbQSAGKk1OZCBBf_sPJqLoFfYOVDWRDzALocBjGQtHeI=s176-c-k-c0x00ffffff-no-rj",
  "The Coding Train":
    "https://yt3.ggpht.com/jx7pgOZeAW4tzBUOW3WVTCi8_RJEWZkJS4AiThnYvoS8TaL5zPwOk0gqBftyya9EMhOm80Yhgw=s176-c-k-c0x00ffffff-no-rj",
  Primer:
    "https://yt3.ggpht.com/YicJ3lAVdXC5jI7SA7mnX7pPoULN2Gfgh_S4IgDPDPjLaeTx1vWiQeh-reCty2uWuoVK70K5Lg=s176-c-k-c0x00ffffff-no-rj",
  Fireship:
    "https://yt3.ggpht.com/3fPNbkf_xPyCleq77ZhcxyeorY97NtMHVNUbaAON_RBDH9ydL4hJkjxC8x_4mpuopkB8oI7Ct6Y=s176-c-k-c0x00ffffff-no-rj",
  Veritasium:
    "https://yt3.ggpht.com/7vCbvtCqtjQ3YLgsJt7Y952MQV1sBvhllSCSxHP8_sVZdcPCBrITfhkN2RdyCuwPnsByq-1GoA=s176-c-k-c0x00ffffff-no-rj",
  "Sebastian Lague":
    "https://yt3.ggpht.com/ytc/AIdro_knyJw3jL_6AGomJmGe3VvfIYxWzZC9Y8z90Liru4G0UHM=s176-c-k-c0x00ffffff-no-rj",
  "Dan Fleisch":
    "https://yt3.googleusercontent.com/ytc/AIdro_nHxYi-ddQxRSR7lm6rJoW3k4MeG6AVuT2YxmZZSi91=s176-c-k-c0x00ffffff-no-rj",
  MinutePhysics:
    "https://yt3.ggpht.com/ytc/AIdro_mNlRy8Ablr-4VtAT6eDe7ED-3tfNFZ0FwhEYdtc6B_oQ=s176-c-k-c0x00ffffff-no-rj",
  "Two Minute Papers":
    "https://yt3.ggpht.com/ytc/AIdro_ljAkSpv16cJNUsE_rI1X-Kz9s78w1WNojUga-aZ1uVzEQ=s176-c-k-c0x00ffffff-no-rj",
  Mathologer:
    "https://yt3.googleusercontent.com/ytc/AIdro_mtp7Rl1Cp7-jl86BU-G093pGxvoZbDSElKgg7rkKDrK6U=s176-c-k-c0x00ffffff-no-rj",
  "Welch Labs":
    "https://yt3.ggpht.com/2iLVDebIe8qFdyAjY48p8XVZYmIA4umizNlZNmURd7q2OOWJLDBD5qQjlLZTUnkehcMIqEHfDw=s176-c-k-c0x00ffffff-no-rj",
  "Lex Fridman":
    "https://yt3.ggpht.com/ytc/AIdro_ljfMy9kUR1PH9VRf-XsTsPqFMgORC_zodOQVEAm4hx36lC=s176-c-k-c0x00ffffff-no-rj",
  Computerphile:
    "https://yt3.ggpht.com/ebHMyRfch3u2UTZN1WQJDp9J5U7o38T_WnGkd2QhAIQwBgvozdaOCOnfDMtngtoHWutJvLl4i0c=s176-c-k-c0x00ffffff-no-rj",
  "Stand-up Maths":
    "https://yt3.googleusercontent.com/ytc/AIdro_kH1XY27N-S65HtyJ97eLeiYGSqanZuuVP2NgTzBt081h4=s176-c-k-c0x00ffffff-no-rj",
  "CGP Grey":
    "https://yt3.googleusercontent.com/ytc/AIdro_nxrDGcxMGo8yKf2_Dw0eaGEWj39IAIdZQjAuz-_mBHjUI=s176-c-k-c0x00ffffff-no-rj",
  Reducible:
    "https://yt3.ggpht.com/4Y72xFDw395XHf878UgzsxXc1I-36cgpjgjWaZx7KRP5D3VsMk_bvFoenvYjDRhEGF9Eo2LdPg=s176-c-k-c0x00ffffff-no-rj",
  "Domain of Science":
    "https://yt3.ggpht.com/qrwWz-16J8HPWPPgLD8FXYdHSUHFW-yeBNUXTzDKjgY3-MsIpPzoBasolfqLdVzGs5kepKfdfA=s176-c-k-c0x00ffffff-no-rj",
  "MIT OpenCourseWare":
    "https://yt3.ggpht.com/swNtJDBP8xHP_zwrbL4tCUQt02B-7Mr8XggFMBjANHn_Q5aUtPmxPs8f8Ag3wO2O-rJpsQQGpA=s176-c-k-c0x00ffffff-no-rj",
  Vsauce:
    "https://yt3.ggpht.com/ytc/AIdro_mpYedipdXUXCKkwjQEeFrepFlDHZ0LiczqWeKyG0YmJvA=s176-c-k-c0x00ffffff-no-rj",
  "Tom Scott":
    "https://yt3.ggpht.com/1jXww-54zOdx2ksMQ2qDO-c7Jc3ud0BSuyS9WdG7mRwk8f-Ipj9hbWM4qYTqLXDvJw_yonQ0ig=s176-c-k-c0x00ffffff-no-rj",
  "Stanford Online":
    "https://yt3.googleusercontent.com/UE4m1O9zmzlEViC33IbGBU0idM-rbGzN1NWag8xMt6JHBG5SmuWmJdF1_uQhhGKLjLiUXvOTwA=s176-c-k-c0x00ffffff-no-rj",
};

interface HeroVideoCardProps {
  videoId: string;
  title: string;
  channelName: string;
  viewCount: number;
  publishedText: string;
  duration?: string;
  conversation?: {
    question: string;
    answer: string;
    timestamp: string;
  };
}

export function HeroVideoCard({
  videoId,
  title,
  channelName,
  duration,
  conversation,
}: HeroVideoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const thumbnailUrl = imgError
    ? `https://img.youtube.com/vi/${videoId}/0.jpg`
    : `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

  return (
    <a
      href={`/watch?v=${videoId}`}
      onClick={(e) => {
        e.stopPropagation();
        window.location.href = `/watch?v=${videoId}`;
      }}
      className="hero-card block relative rounded-lg overflow-hidden cursor-pointer border border-white/[0.06] hover:border-white/[0.18] hover:scale-[1.06] transition-all duration-400 group h-full"
      style={{
        pointerEvents: "auto",
        background: "rgba(255,255,255,0.03)",
        boxShadow:
          "0 2px 16px rgba(0,0,0,0.3), inset 0 0.5px 0 rgba(255,255,255,0.04)",
        transformOrigin: "center center",
      }}
    >
      {/* Metadata row — above thumbnail */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-white/[0.06]">
        {CHANNEL_AVATARS[channelName] && !avatarError && (
          <img
            src={CHANNEL_AVATARS[channelName]}
            alt=""
            className="w-6 h-6 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-90 transition-opacity duration-400"
            onError={() => setAvatarError(true)}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-white/35 line-clamp-1 leading-tight group-hover:text-white/55 transition-colors duration-400">
            {title}
          </p>
          <p className="text-[9px] text-white/20 mt-0.5 group-hover:text-white/35 transition-colors duration-400">
            {channelName}
          </p>
        </div>
      </div>

      {/* Thumbnail */}
      <div className="overflow-hidden relative flex-1">
        <img
          src={thumbnailUrl}
          alt={title}
          loading="eager"
          decoding="async"
          className="w-full h-full object-cover opacity-[0.55] transition-opacity duration-400"
          onError={() => setImgError(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t via-transparent to-transparent from-black/60" />

        {/* Grain overlay — fades in on hover for text readability */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-in-out z-[1]"
          style={{
            backdropFilter: `url(#${CARD_GRAIN_FILTER_ID})`,
            WebkitBackdropFilter: `url(#${CARD_GRAIN_FILTER_ID})`,
          }}
        />

        {/* Duration badge — top right */}
        {duration && (
          <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded-sm bg-black/70 text-white/70 text-[9px] font-mono tracking-wide z-[3]">
            {duration}
          </div>
        )}

        {/* Conversation whisper — desktop only */}
        {conversation && (
          <div
            className="hidden md:flex flex-col justify-end absolute inset-0 pointer-events-none z-[2]"
            style={{
              backfaceVisibility: "hidden",
              transform: "translateZ(0)",
            }}
          >
            {/* Dark gradient — always visible for readability, intensifies on hover */}
            <div className="absolute inset-0 bg-gradient-to-t to-transparent transition-all duration-500 from-black/80 via-black/40 group-hover:from-black/95 group-hover:via-black/60" />

            <div className="relative px-2.5 pb-2">
              {/* Question — chat-bubble style, always readable */}
              <div className="inline-block max-w-full bg-white/[0.08] group-hover:bg-white/[0.12] border border-white/[0.08] group-hover:border-white/[0.15] rounded-lg px-2 py-1 transition-all duration-500">
                <p className="text-[11px] leading-snug text-white/40 group-hover:text-white font-medium line-clamp-2">
                  &ldquo;{conversation.question}&rdquo;
                </p>
              </div>
              {/* AI response — appears on hover */}
              <div className="mt-1.5 max-h-0 group-hover:max-h-28 opacity-0 group-hover:opacity-100 transition-all duration-500 overflow-hidden">
                <div className="flex gap-1 justify-start items-center mb-1">
                  <p className="text-[9px] text-chalk-accent/80 font-medium tracking-wide uppercase">
                    {channelName}
                  </p>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-blue-500/20 text-blue-400">
                    {conversation.timestamp}
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-slate-300/80 line-clamp-3">
                  {conversation.answer}{" "}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Play icon — fades in on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-400 z-[2]">
          <div className="flex justify-center items-center w-8 h-8 rounded-full bg-white/20">
            <svg
              width="12"
              height="14"
              viewBox="0 0 12 14"
              fill="none"
              className="ml-0.5"
            >
              <path d="M0 0V14L12 7L0 0Z" fill="rgba(255,255,255,0.8)" />
            </svg>
          </div>
        </div>
      </div>
    </a>
  );
}
