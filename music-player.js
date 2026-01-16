(function() {
  'use strict';

  const { useState, useEffect, useRef } = React;

  // My YouTube API credentials
  const YOUTUBE_API_KEY = 'AIzaSyDQcRnvaqDlX0xD4EGS3uImntcvtxzPI34'; 
  const YOUTUBE_PLAYLIST_ID = 'PLifrH-9w0BzLWOBZ7VbonEQHI6xTt1B_5'; 
 
  const FALLBACK_AUDIO_MAP = {
  };
  
  let globalPlayer = null;
  let globalAudio = null; 
  let globalPlaylist = null;
  let globalCurrentIndex = 0;
  let globalIsPlaying = false;
  let globalIsMuted = false;
  const DEFAULT_VOLUME = 60; 
  let youtubeAPIReady = false;
  let isAdvancing = false; 
  let playbackPositionInterval = null; 
  let usingFallback = false;
  let stuckPlaybackTimeout = null;

  // This checks if current page should auto-play music (hero + main pages)
  function isHomepage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || '';
    const href = window.location.href;
    const autoPlayPages = ['Rivals.html', 'Hero.html', 'Patch.html', 'Community.html', '', 'index.html'];
    return autoPlayPages.includes(filename) || href.endsWith('/') || href.includes('Rivals.html');
  }

  // Initialize YouTube IFrame API
  function initYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      youtubeAPIReady = true;
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      if (window.onYouTubeIframeAPIReady) {
        const oldCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          oldCallback();
          youtubeAPIReady = true;
          resolve();
        };
      } else {
        window.onYouTubeIframeAPIReady = () => {
          youtubeAPIReady = true;
          resolve();
        };
      }
    });
  }

  // Check if user is admin
  function isAdminUser() {
    try {
      const loggedInUserStr = localStorage.getItem('loggedInUser') || sessionStorage.getItem('loggedInUser');
      if (!loggedInUserStr) return false;
      const user = JSON.parse(loggedInUserStr);
      return !!user && String(user.role || 'user') === 'admin';
    } catch {
      return false;
    }
  }

  // Shuffle array while maintaining order (Fisher-Yates shuffle)
  function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Fetch YouTube playlist items
  async function fetchYouTubePlaylist(playlistId, apiKey) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}`
      );
      
      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        throw new Error('Playlist is empty or not found');
      }
      
      const songs = data.items.map((item, index) => {
        const snippet = item.snippet;
        const videoId = snippet.resourceId.videoId;
        return {
          _id: item.id,
          videoId: videoId,
          title: snippet.title,
          artist: snippet.videoOwnerChannelTitle || 'Unknown Artist',
          albumArt: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '',
          duration: snippet.duration || null
        };
      });
      
      return {
        name: 'YouTube Playlist',
        songs: songs,
        currentSongIndex: 0
      };
    } catch (error) {
      console.error('Error fetching YouTube playlist:', error);
      throw error;
    }
  }

  function MusicPlayer() {
    const [playlist, setPlaylist] = useState(null);
    const [currentSongIndex, setCurrentSongIndex] = useState(0);
    const [isMuted, setIsMuted] = useState(() => {
      // Check if user manually unmuted (this persists across pages)
      const userManuallyUnmuted = localStorage.getItem('userManuallyUnmuted') === 'true';
      const savedMuteState = localStorage.getItem('musicMuted');
      
      if (isHomepage()) {
        // On homepage: check if user manually muted
        // If no saved state, default to unmuted (auto-play on first load)
        if (savedMuteState === null) {
          return false; // Start unmuted (playing) on first load
        }
        return savedMuteState === 'true';
      } else {
        // On other pages: auto-mute only if user hasn't manually unmuted
        return !userManuallyUnmuted;
      }
    });
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    const playerContainerRef = useRef(null);
    const clickTimeoutRef = useRef(null);
    const panelRef = useRef(null);
    const iconRef = useRef(null);

    // Play fallback audio (local file) when YouTube embedding fails
    const playFallbackAudio = (audioPath, song) => {
      console.log('🎵 Using fallback audio for:', song.title);
      usingFallback = true;
      
      // Stop YouTube player
      if (globalPlayer && globalPlayer.stopVideo) {
        try {
          globalPlayer.stopVideo();
        } catch (e) {
          // Ignore errors
        }
      }
      
      // Create or reuse HTML5 audio element
      if (!globalAudio) {
        globalAudio = new Audio();
        globalAudio.volume = DEFAULT_VOLUME / 100;
        globalAudio.loop = false;
        
        // Auto-play next song when current ends
        globalAudio.addEventListener('ended', () => {
          if (globalPlaylist && globalPlaylist.songs.length > 0) {
            const nextIndex = (globalCurrentIndex + 1) % globalPlaylist.songs.length;
            globalCurrentIndex = nextIndex;
            setCurrentSongIndex(nextIndex);
            localStorage.setItem('currentSongIndex', nextIndex.toString());
            startPlaying(nextIndex, false);
          }
        });
        
        globalAudio.addEventListener('play', () => {
          globalIsPlaying = true;
        });
        
        globalAudio.addEventListener('pause', () => {
          globalIsPlaying = false;
        });
      }
      
      // Set volume based on mute state
      const shouldBeMuted = isHomepage() 
        ? (localStorage.getItem('musicMuted') === 'true')
        : !(localStorage.getItem('userManuallyUnmuted') === 'true');
      
      globalIsMuted = shouldBeMuted;
      setIsMuted(shouldBeMuted);
      globalAudio.volume = shouldBeMuted ? 0 : DEFAULT_VOLUME / 100;
      
      // Load and play audio
      globalAudio.src = audioPath;
      globalAudio.load();
      
      // Auto-play on homepage if not muted
      if (isHomepage() && !shouldBeMuted) {
        const playPromise = globalAudio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('✅ Fallback audio started playing');
              globalIsPlaying = true;
            })
            .catch(error => {
              console.log('⚠️ Fallback audio autoplay prevented:', error);
              // Try on user interaction
              const tryPlayOnInteraction = () => {
                globalAudio.play().catch(e => console.log('Still blocked:', e));
                document.removeEventListener('click', tryPlayOnInteraction);
                document.removeEventListener('touchstart', tryPlayOnInteraction);
              };
              document.addEventListener('click', tryPlayOnInteraction, { once: true });
              document.addEventListener('touchstart', tryPlayOnInteraction, { once: true });
            });
        }
      }
    };

    // Play next song - defined outside useEffect so it's accessible to callbacks
    const playNextSong = () => {
      if (!globalPlaylist || globalPlaylist.songs.length === 0) {
        console.log('⚠️ No playlist or empty playlist');
        isAdvancing = false; // Reset flag
        return;
      }
      
      if (isAdvancing) {
        console.log('⚠️ Already advancing, skipping');
        return;
      }
      
      // Set flag to prevent multiple simultaneous calls
      isAdvancing = true;
      
      // Stop fallback audio if playing
      if (usingFallback && globalAudio) {
        globalAudio.pause();
        usingFallback = false;
      }
      
      // Clear saved position when moving to next song
      localStorage.removeItem('playbackPosition');
      
      const nextIndex = (globalCurrentIndex + 1) % globalPlaylist.songs.length;
      console.log('⏭️ Advancing to next song, index:', nextIndex, 'song:', globalPlaylist.songs[nextIndex]?.title);
      
      // Ensure we're not muted if we should be playing
      const userManuallyUnmuted = localStorage.getItem('userManuallyUnmuted') === 'true';
      const shouldBeMuted = isHomepage() 
        ? (localStorage.getItem('musicMuted') === 'true')
        : !userManuallyUnmuted;
      
      // If we should be playing, make sure we're not muted
      if (isHomepage() && !shouldBeMuted) {
        globalIsMuted = false;
        setIsMuted(false);
      }
      
      if (stuckPlaybackTimeout) {
        clearTimeout(stuckPlaybackTimeout);
        stuckPlaybackTimeout = null;
      }
      
      // Start playing the next song
      startPlaying(nextIndex, false); // Don't restore position for new song
      
      // Reset flag after a short delay to allow the song to start
      setTimeout(() => {
        isAdvancing = false;
        console.log('✅ Next song started, isAdvancing reset');
      }, 500);
    };

    // Start playing a song - defined outside useEffect so it's accessible
    const startPlaying = (index, restorePosition = false) => {
      if (!globalPlayer || !globalPlaylist || !globalPlaylist.songs[index]) {
        console.log('Cannot play: player or playlist not ready');
        return;
      }

      const song = globalPlaylist.songs[index];
      console.log('Starting to play:', song.title, 'at index:', index, 'restorePosition:', restorePosition);
      
      setCurrentSongIndex(index);
      globalCurrentIndex = index;
      localStorage.setItem('currentSongIndex', index.toString());
      if (stuckPlaybackTimeout) {
        clearTimeout(stuckPlaybackTimeout);
        stuckPlaybackTimeout = null;
      }

      // Determine mute state
      const userManuallyUnmuted = localStorage.getItem('userManuallyUnmuted') === 'true';
      const isOnHomepage = isHomepage();
      const savedMuteState = localStorage.getItem('musicMuted');
      let shouldBeMuted;
      
      if (isOnHomepage) {
        // On homepage: check if user manually muted
        // If this is the first load (savedMuteState === null), default to unmuted (auto-play)
        if (savedMuteState === null && !restorePosition) {
          shouldBeMuted = false;
          localStorage.setItem('musicMuted', 'false');
          console.log('🏠 First load on homepage - setting to unmuted (auto-play)');
        } else {
          shouldBeMuted = savedMuteState === 'true';
          console.log('🏠 Homepage detected - mute state:', shouldBeMuted, 'saved:', savedMuteState);
        }
      } else {
        // On other pages: auto-mute only if user hasn't manually unmuted
        shouldBeMuted = !userManuallyUnmuted;
        console.log('📄 Other page detected - auto-mute:', shouldBeMuted, 'userManuallyUnmuted:', userManuallyUnmuted);
      }
      
      globalIsMuted = shouldBeMuted;
      setIsMuted(shouldBeMuted);
      
      // Determine if we should auto-play (userManuallyUnmuted already defined above)
      const shouldAutoPlay = isHomepage() ? !shouldBeMuted : userManuallyUnmuted;
      
      // Get saved playback position
      const savedPosition = restorePosition ? parseFloat(localStorage.getItem('playbackPosition') || '0') : 0;
      
      // Set volume and mute state BEFORE loading video (for immediate effect)
      try {
        if (globalPlayer.setVolume) {
          const volumeToSet = shouldBeMuted ? 0 : DEFAULT_VOLUME;
          globalPlayer.setVolume(volumeToSet);
          console.log('✅ Volume set to:', volumeToSet, 'muted:', shouldBeMuted);
        }
        // YouTube has a separate mute state - ensure it's set correctly
        if (shouldBeMuted && globalPlayer.mute) {
          globalPlayer.mute();
        } else if (!shouldBeMuted && globalPlayer.unMute) {
          globalPlayer.unMute();
        }
      } catch (e) {
        console.error('Error setting volume/mute:', e);
      }

      // Load video with saved position
      try {
        globalPlayer.loadVideoById({
          videoId: song.videoId,
          startSeconds: savedPosition
        });

        // Also set volume/mute again after loading (in case it didn't stick)
        setTimeout(() => {
          if (globalPlayer) {
            const volumeToSet = shouldBeMuted ? 0 : DEFAULT_VOLUME;
            try {
              if (globalPlayer.setVolume) {
                globalPlayer.setVolume(volumeToSet);
              }
              if (shouldBeMuted && globalPlayer.mute) {
                globalPlayer.mute();
              } else if (!shouldBeMuted && globalPlayer.unMute) {
                globalPlayer.unMute();
              }
            } catch (e) {
              console.error('Error setting volume/mute after load:', e);
            }
          }
        }, 100);

        // Immediate play attempt after loading (especially important for first song)
        if (shouldAutoPlay) {
          // Try to play immediately after a short delay (video needs time to load)
          setTimeout(() => {
            if (globalPlayer && globalPlayer.playVideo) {
              try {
                const state = globalPlayer.getPlayerState ? globalPlayer.getPlayerState() : -1;
                console.log('🎵 Immediate play attempt after loadVideoById, state:', state);
                
                // Ensure unmuted
                if (!shouldBeMuted && globalPlayer.unMute) {
                  globalPlayer.unMute();
                }
                
                // Try to play regardless of state (YouTube will handle it)
                globalPlayer.playVideo();
                console.log('✅ Immediate playVideo() called after loadVideoById');
              } catch (e) {
                console.log('Error in immediate play attempt:', e);
              }
            }
          }, 500); // Give video time to start loading
        }

        // Start saving playback position periodically
        if (playbackPositionInterval) {
          clearInterval(playbackPositionInterval);
        }
        playbackPositionInterval = setInterval(() => {
          if (globalPlayer && globalPlayer.getCurrentTime) {
            try {
              const currentTime = globalPlayer.getCurrentTime();
              localStorage.setItem('playbackPosition', currentTime.toString());
            } catch (e) {
              // Ignore errors
            }
          }
        }, 2000); // Save every 2 seconds

        // Auto-play logic - be aggressive about it
        // shouldAutoPlay is already defined above
        const isFirstLoad = savedMuteState === null && isHomepage();
        
        console.log('🎵 Auto-play check:', { shouldAutoPlay, isHomepage: isHomepage(), shouldBeMuted, userManuallyUnmuted, isFirstLoad });
        
        if (shouldAutoPlay) {
          // Multiple attempts to play - browsers can be finicky
          // On first load, be even more aggressive
          const maxAttempts = isFirstLoad ? 30 : 20;
          const tryPlay = (attempt = 1) => {
            if (!globalPlayer) {
              console.log(`⚠️ Player not ready on attempt ${attempt}`);
              if (attempt < maxAttempts) {
                setTimeout(() => tryPlay(attempt + 1), 200);
              }
              return;
            }
            
            try {
              const state = globalPlayer.getPlayerState ? globalPlayer.getPlayerState() : -1;
              console.log(`🎵 Play attempt ${attempt}, state:`, state, 'isPlaying:', globalIsPlaying);
              
              // Ensure unmuted before trying to play
              if (!shouldBeMuted && globalPlayer.unMute) {
                try {
                  globalPlayer.unMute();
                } catch (e) {
                  // Ignore
                }
              }
              
              // Try to play if video is ready (CUED, PAUSED, or even UNSTARTED)
              if (state === window.YT.PlayerState.CUED || 
                  state === window.YT.PlayerState.PAUSED || 
                  state === window.YT.PlayerState.UNSTARTED ||
                  state === -1 ||
                  state === window.YT.PlayerState.BUFFERING) {
                
                if (globalPlayer.playVideo) {
                  globalPlayer.playVideo();
                  console.log(`✅ Play command sent (attempt ${attempt})`);
                }
                
                // Keep trying if not playing yet
                if (attempt < maxAttempts && !globalIsPlaying) {
                  setTimeout(() => tryPlay(attempt + 1), isFirstLoad ? 300 : 500);
                }
              } else if (state === window.YT.PlayerState.PLAYING) {
                // Already playing, stop trying
                globalIsPlaying = true;
                console.log('✅ Video is already playing!');
              }
            } catch (error) {
              console.error(`Error on play attempt ${attempt}:`, error);
              if (attempt < maxAttempts) {
                setTimeout(() => tryPlay(attempt + 1), isFirstLoad ? 300 : 500);
              }
            }
          };
          
          // Start trying immediately and keep retrying more aggressively
          // On first load, start even sooner and more frequently
          if (isFirstLoad) {
            setTimeout(() => tryPlay(1), 50);
            setTimeout(() => tryPlay(2), 200);
            setTimeout(() => tryPlay(3), 400);
            setTimeout(() => tryPlay(4), 700);
            setTimeout(() => tryPlay(5), 1100);
            setTimeout(() => tryPlay(6), 1600);
            setTimeout(() => tryPlay(7), 2200);
            setTimeout(() => tryPlay(8), 2900);
          } else {
            setTimeout(() => tryPlay(1), 100);
            setTimeout(() => tryPlay(2), 500);
            setTimeout(() => tryPlay(3), 1000);
            setTimeout(() => tryPlay(4), 2000);
            setTimeout(() => tryPlay(5), 3500);
            setTimeout(() => tryPlay(6), 5000);
          }
          
          // Also try on ANY user interaction
          const tryPlayOnInteraction = (e) => {
            if (globalPlayer && globalPlayer.playVideo && !globalIsPlaying) {
              try {
                globalPlayer.playVideo();
                console.log('✅ Video play triggered by user interaction:', e.type);
              } catch (e) {
                console.log('Error playing on interaction:', e);
              }
            }
          };
          
          // Listen to multiple interaction types
          ['click', 'touchstart', 'mousedown', 'keydown', 'scroll', 'mousemove'].forEach(eventType => {
            document.addEventListener(eventType, tryPlayOnInteraction, { once: true, passive: true });
          });
          
          stuckPlaybackTimeout = setTimeout(() => {
            const currentState = globalPlayer && typeof globalPlayer.getPlayerState === 'function'
              ? globalPlayer.getPlayerState()
              : null;
            const playingState = window.YT && window.YT.PlayerState ? window.YT.PlayerState.PLAYING : 1;
            if (!globalIsMuted && currentState !== playingState) {
              console.warn('⚠️ Current track is stuck, automatically skipping...');
              playNextSong();
            }
          }, 8000);
        } else {
          // On other pages or if muted, just load but don't play
          const reason = !isHomepage() ? 'not homepage' : 'muted';
          console.log(`Video loaded but not playing (${reason})`);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading video:', error);
        setIsLoading(false);
      }
    };

    // Initialize YouTube Player
    useEffect(() => {
      async function setupPlayer() {
        try {
          // Wait for YouTube API to be ready
          await initYouTubeAPI();
          
          if (!youtubeAPIReady || !window.YT || !window.YT.Player) {
            console.error('YouTube API not ready');
            setIsLoading(false);
            return;
          }

          // Create hidden iframe container if it doesn't exist
          if (!playerContainerRef.current) {
            const container = document.createElement('div');
            container.id = 'youtube-player-container';
            container.style.display = 'none';
            document.body.appendChild(container);
            playerContainerRef.current = container;
          }

          // Initialize or get global player
          if (!globalPlayer) {
            globalPlayer = new window.YT.Player('youtube-player-container', {
              height: '0',
              width: '0',
              playerVars: {
                autoplay: 1, // Try to autoplay
                controls: 0,
                disablekb: 1,
                enablejsapi: 1,
                fs: 0,
                iv_load_policy: 3,
                modestbranding: 1,
                playsinline: 1,
                rel: 0,
                mute: 0 // Don't start muted
              },
              events: {
                onReady: (event) => {
                  console.log('✅ YouTube player ready');
                  globalPlayer = event.target;
                  
                  // On first load of homepage, ensure player is unmuted and ready to play
                  const savedMuteState = localStorage.getItem('musicMuted');
                  const isFirstLoad = savedMuteState === null && isHomepage();
                  
                  // Set initial volume and unmute state immediately
                  try {
                    if (isFirstLoad) {
                      // First load on homepage - start unmuted and playing
                      globalPlayer.setVolume(DEFAULT_VOLUME);
                      globalPlayer.unMute();
                      globalIsMuted = false;
                      setIsMuted(false);
                      localStorage.setItem('musicMuted', 'false');
                      console.log('🏠 First load - player unmuted and ready to play');
                    } else {
                      // Subsequent loads - respect saved state
                      const shouldBeMuted = isHomepage() 
                        ? (savedMuteState === 'true')
                        : !(localStorage.getItem('userManuallyUnmuted') === 'true');
                      
                      globalPlayer.setVolume(shouldBeMuted ? 0 : DEFAULT_VOLUME);
                      if (shouldBeMuted) {
                        globalPlayer.mute();
                      } else {
                        globalPlayer.unMute();
                      }
                      globalIsMuted = shouldBeMuted;
                      setIsMuted(shouldBeMuted);
                      console.log('✅ Volume and mute state set:', { volume: shouldBeMuted ? 0 : DEFAULT_VOLUME, muted: shouldBeMuted });
                    }
                  } catch (e) {
                    console.error('Error setting volume/mute:', e);
                  }
                  
                  // Load playlist and start playing
                  loadPlaylist();
                },
                onStateChange: (event) => {
                  // YT.PlayerState.ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5, UNSTARTED = -1
                  const state = event.data;
                  console.log('YouTube player state changed:', state);
                  
                  if (state === window.YT.PlayerState.ENDED) {
                    // Clear saved position when song ends
                    localStorage.removeItem('playbackPosition');
                    if (stuckPlaybackTimeout) {
                      clearTimeout(stuckPlaybackTimeout);
                      stuckPlaybackTimeout = null;
                    }
                    // Only advance if not already advancing
                    if (!isAdvancing) {
                      console.log('🎵 Song ended, advancing to next song...');
                      // Small delay to ensure clean transition
                      setTimeout(() => {
                        playNextSong();
                      }, 100); // Reduced delay for faster transition
                    } else {
                      console.log('⚠️ Already advancing, skipping ENDED handler');
                    }
                  } else if (state === window.YT.PlayerState.PLAYING) {
                    globalIsPlaying = true;
                    if (stuckPlaybackTimeout) {
                      clearTimeout(stuckPlaybackTimeout);
                      stuckPlaybackTimeout = null;
                    }
                    console.log('✅ Video is now playing - AUDIO SHOULD BE HEARABLE');
                    // Force unmute when playing starts
                    if (globalPlayer && globalPlayer.unMute) {
                      try {
                        globalPlayer.unMute();
                        console.log('✅ Player unmuted');
                      } catch (e) {
                        console.log('Error unmuting:', e);
                      }
                    }
                  } else if (state === window.YT.PlayerState.PAUSED) {
                    globalIsPlaying = false;
                  } else if (state === window.YT.PlayerState.BUFFERING) {
                    // Video is buffering - might be ready to play soon
                    const userManuallyUnmuted = localStorage.getItem('userManuallyUnmuted') === 'true';
                    const savedMuteState = localStorage.getItem('musicMuted');
                    const shouldBeMuted = isHomepage() 
                      ? (savedMuteState === 'true')
                      : !userManuallyUnmuted;
                    const shouldAutoPlay = isHomepage() ? !shouldBeMuted : userManuallyUnmuted;
                    
                    if (shouldAutoPlay && !globalIsPlaying) {
                      // Ensure unmuted
                      if (!shouldBeMuted && globalPlayer && globalPlayer.unMute) {
                        try {
                          globalPlayer.unMute();
                        } catch (e) {
                          // Ignore
                        }
                      }
                      // Try to play - buffering often means video is ready
                      if (globalPlayer && globalPlayer.playVideo) {
                        try {
                          globalPlayer.playVideo();
                          console.log('✅ Video play triggered during BUFFERING state');
                        } catch (e) {
                          // Ignore
                        }
                      }
                    }
                  } else if (state === window.YT.PlayerState.CUED) {
                    // Video is cued and ready - try to play if we should
                    const userManuallyUnmuted = localStorage.getItem('userManuallyUnmuted') === 'true';
                    const savedMuteState = localStorage.getItem('musicMuted');
                    const isFirstLoad = savedMuteState === null && isHomepage();
                    const shouldBeMuted = isHomepage() 
                      ? (savedMuteState === 'true')
                      : !userManuallyUnmuted;
                    const shouldAutoPlay = isHomepage() ? !shouldBeMuted : userManuallyUnmuted;
                    
                    console.log('🎵 Video CUED - shouldAutoPlay:', shouldAutoPlay, 'isFirstLoad:', isFirstLoad, 'globalIsPlaying:', globalIsPlaying);
                    
                    if (shouldAutoPlay && !globalIsPlaying) {
                      // Ensure unmuted before playing
                      if (!shouldBeMuted && globalPlayer && globalPlayer.unMute) {
                        try {
                          globalPlayer.unMute();
                          console.log('✅ Player unmuted in CUED state');
                        } catch (e) {
                          console.log('Error unmuting in CUED:', e);
                        }
                      }
                      
                      // Try to play immediately when CUED (this is the best time)
                      if (globalPlayer && globalPlayer.playVideo) {
                        try {
                          globalPlayer.playVideo();
                          console.log('✅ Video play triggered immediately after CUED state');
                        } catch (e) {
                          console.log('Error playing immediately after CUED:', e);
                        }
                      }
                      
                      // Also try again after a short delay (in case first attempt didn't work)
                      setTimeout(() => {
                        if (globalPlayer && globalPlayer.playVideo && !globalIsPlaying) {
                          try {
                            globalPlayer.playVideo();
                            console.log('✅ Second play attempt after CUED state');
                          } catch (e) {
                            console.log('Error on second play attempt after CUED:', e);
                          }
                        }
                      }, isFirstLoad ? 200 : 500);
                      
                      // On first load, try a third time
                      if (isFirstLoad) {
                        setTimeout(() => {
                          if (globalPlayer && globalPlayer.playVideo && !globalIsPlaying) {
                            try {
                              globalPlayer.playVideo();
                              console.log('✅ Third play attempt after CUED (first load)');
                            } catch (e) {
                              console.log('Error on third play attempt:', e);
                            }
                          }
                        }, 600);
                      }
                    }
                  }
                },
                onError: (event) => {
                  const errorCode = event.data;
                  console.error('YouTube player error:', errorCode);
                  if (stuckPlaybackTimeout) {
                    clearTimeout(stuckPlaybackTimeout);
                    stuckPlaybackTimeout = null;
                  }
                  
                  // Error codes: 2=invalid ID, 5=HTML5 error, 100=not found, 101/150=embedding disabled
                  let errorMessage = 'Unknown error';
                  if (errorCode === 2) errorMessage = 'Invalid video ID';
                  else if (errorCode === 5) errorMessage = 'HTML5 player error';
                  else if (errorCode === 100) errorMessage = 'Video not found';
                  else if (errorCode === 101 || errorCode === 150) errorMessage = 'Video embedding disabled - cannot play this video';
                  
                  console.error(`❌ ${errorMessage} (Error ${errorCode})`);
                  
                  // Try fallback audio if embedding is disabled
                  if ((errorCode === 101 || errorCode === 150) && globalPlaylist && globalPlaylist.songs[globalCurrentIndex]) {
                    const currentSong = globalPlaylist.songs[globalCurrentIndex];
                    const fallbackAudio = FALLBACK_AUDIO_MAP[currentSong.videoId];
                    
                    if (fallbackAudio) {
                      console.log('🔄 Trying fallback audio file:', fallbackAudio);
                      playFallbackAudio(fallbackAudio, currentSong);
                      return; // Don't skip to next song, use fallback instead
                    } else {
                      console.log('⚠️ No fallback audio found for this video. Add it to FALLBACK_AUDIO_MAP in music-player.js');
                    }
                  }
                  
                  // Try next song on error, but only if not already advancing
                  if (!isAdvancing) {
                    setTimeout(() => {
                      console.log('⏭️ Skipping to next song due to error');
                      playNextSong(); // playNextSong() manages isAdvancing flag itself
                    }, 1000);
                  } else {
                    console.log('⚠️ Already advancing, skipping error handler');
                  }
                }
              }
            });
          } else {
            // Player already exists, just load playlist
            loadPlaylist();
          }
        } catch (error) {
          console.error('Error setting up YouTube player:', error);
          setIsLoading(false);
        }
      }

      async function loadPlaylist() {
        try {
          setIsLoading(true);
          
          // Check if API key and playlist ID are configured
          if (YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE' || YOUTUBE_PLAYLIST_ID === 'YOUR_PLAYLIST_ID_HERE') {
            console.error('⚠️ Please configure YOUTUBE_API_KEY and YOUTUBE_PLAYLIST_ID in music-player.js');
            setIsLoading(false);
            return;
          }

          // Fetch playlist from YouTube
          const playlistData = await fetchYouTubePlaylist(YOUTUBE_PLAYLIST_ID, YOUTUBE_API_KEY);
          
          // Shuffle the playlist on load (maintains order, just randomizes once)
          const shuffledSongs = shuffleArray(playlistData.songs);
          const shuffledPlaylist = { ...playlistData, songs: shuffledSongs };
          
          setPlaylist(shuffledPlaylist);
          globalPlaylist = shuffledPlaylist;
          
          // Always start from the first song in the playlist on each page load.
          // Previously this used a saved index from localStorage, which could
          // cause playback to begin in the middle of the playlist.
          const startIndex = 0;
          setCurrentSongIndex(startIndex);
          globalCurrentIndex = startIndex;

          // Clear any saved position so the first track starts at the beginning.
          localStorage.removeItem('currentSongIndex');
          localStorage.removeItem('playbackPosition');
          
          // Start playing from the beginning without restoring position
          startPlaying(startIndex, false);
        } catch (error) {
          console.error('Error loading playlist:', error);
          setIsLoading(false);
        }
      }

      setupPlayer();
    }, []);


    // Listen for video mute requests
    useEffect(() => {
      const handleMuteRequest = (e) => {
        const shouldMute = e.detail.mute;
        setIsMuted(shouldMute);
      };
      
      window.addEventListener('musicMuteRequest', handleMuteRequest);
      return () => {
        window.removeEventListener('musicMuteRequest', handleMuteRequest);
      };
    }, []);

    // Update mute state
    useEffect(() => {
      globalIsMuted = isMuted;
      
      // Update YouTube player
      if (globalPlayer && !usingFallback) {
        try {
          if (globalPlayer.setVolume) {
            globalPlayer.setVolume(isMuted ? 0 : DEFAULT_VOLUME);
          }
          // YouTube has a separate mute state
          if (isMuted && globalPlayer.mute) {
            globalPlayer.mute();
          } else if (!isMuted && globalPlayer.unMute) {
            globalPlayer.unMute();
          }
        } catch (e) {
          console.error('Error updating YouTube mute state:', e);
        }
      }
      
      // Update fallback audio
      if (globalAudio && usingFallback) {
        globalAudio.volume = isMuted ? 0 : DEFAULT_VOLUME / 100;
      }
        
      // Save mute state
      localStorage.setItem('musicMuted', isMuted.toString());
      
      // Track if user manually unmuted (for non-homepage pages)
      if (!isHomepage()) {
        if (!isMuted) {
          // User manually unmuted on non-homepage - remember this preference
          localStorage.setItem('userManuallyUnmuted', 'true');
        }
        // Note: We don't clear userManuallyUnmuted when muting, 
        // so it persists across page navigation
      } else {
        // On homepage, if user manually mutes, clear the userManuallyUnmuted flag
        // so that other pages will be auto-muted again
        if (isMuted) {
          localStorage.removeItem('userManuallyUnmuted');
        }
      }
      
      // If unmuted and not playing, try to play
      if (!isMuted && !globalIsPlaying) {
        if (usingFallback && globalAudio) {
          globalAudio.play()
            .then(() => {
              globalIsPlaying = true;
              console.log('✅ Resumed fallback audio playback after unmute');
            })
            .catch(e => console.log('Could not resume fallback audio:', e));
        } else if (globalPlayer && globalPlayer.playVideo) {
          try {
            globalPlayer.playVideo();
            globalIsPlaying = true;
            console.log('✅ Resuming playback after unmute');
          } catch (e) {
            console.log('Could not resume playback:', e);
          }
        }
      }
      
      // If muted and playing, pause
      if (isMuted && globalIsPlaying) {
        if (usingFallback && globalAudio) {
          globalAudio.pause();
          globalIsPlaying = false;
        } else if (globalPlayer && globalPlayer.pauseVideo) {
          try {
            globalPlayer.pauseVideo();
            globalIsPlaying = false;
          } catch (e) {
            console.log('Could not pause playback:', e);
          }
        }
      }
    }, [isMuted]);

    // Handle click with double-click detection
    const handleIconClick = (e) => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
        handleDoubleClick();
      } else {
        clickTimeoutRef.current = setTimeout(() => {
          clickTimeoutRef.current = null;
          setIsOpen(!isOpen);
        }, 300);
      }
    };

    // Double click to mute/unmute
    const handleDoubleClick = () => {
      const newMutedState = !isMuted;
      setIsMuted(newMutedState);
    };

    // Close panel when clicking outside or pressing Escape
    useEffect(() => {
      if (!isOpen) return;
      const handlePointerDown = (event) => {
        if (panelRef.current?.contains(event.target)) return;
        if (iconRef.current?.contains(event.target)) return;
        setIsOpen(false);
      };
      const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
          setIsOpen(false);
        }
      };
      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isOpen]);

    // Skip song (move to bottom of playlist and play next)
    const skipSong = (songId, index) => {
      if (!playlist || !globalPlayer) return;
      
      // If skipping current song, play next one and move current to bottom
      if (index === currentSongIndex) {
        if (playlist.songs.length > 1) {
          // Get the current song
          const currentSong = playlist.songs[index];
          
          // Create new playlist: remove current song, then add it to the end
          const newSongs = [...playlist.songs];
          newSongs.splice(index, 1);
          newSongs.push(currentSong);
          
          const updatedPlaylist = { ...playlist, songs: newSongs };
          setPlaylist(updatedPlaylist);
          globalPlaylist = updatedPlaylist;
          
          // Play the next song (which is now at the same index)
          startPlaying(index);
        } else {
          // No more songs
          if (globalPlayer.stopVideo) {
            globalPlayer.stopVideo();
          }
          globalIsPlaying = false;
        }
      } else {
        // If skipping a future song, just move it to the bottom
        const skippedSong = playlist.songs[index];
        const newSongs = [...playlist.songs];
        newSongs.splice(index, 1);
        newSongs.push(skippedSong);
        
        const updatedPlaylist = { ...playlist, songs: newSongs };
        setPlaylist(updatedPlaylist);
        globalPlaylist = updatedPlaylist;
        
        // Adjust current index if needed
        if (index < currentSongIndex) {
          const newIndex = currentSongIndex - 1;
          setCurrentSongIndex(newIndex);
          globalCurrentIndex = newIndex;
          localStorage.setItem('currentSongIndex', newIndex.toString());
        }
      }
    };

    const currentSong = playlist?.songs[currentSongIndex];
    const isPlaying = globalIsPlaying && !globalIsMuted;
    
    // Add visual status indicator
    useEffect(() => {
      if (globalPlayer && isPlaying) {
        console.log('🎵 MUSIC IS PLAYING - Check your speakers/headphones!');
      } else if (globalPlayer && !isPlaying && !isMuted) {
        console.log('⏸️ Music loaded but not playing (may be blocked by browser)');
      }
    }, [isPlaying, isMuted]);
    
    // Create SVG icon
    const createSVGIcon = (pathData) => {
      return React.createElement('svg', { viewBox: '0 0 24 24', fill: 'currentColor' },
        React.createElement('path', { d: pathData })
      );
    };

    return React.createElement(React.Fragment, null,
      // Fixed Music Icon - Bottom Left
      React.createElement('div', {
        className: `music-player-icon ${isPlaying && !isMuted ? 'playing' : ''} ${isMuted ? 'muted' : ''} music-player-icon--fade-in`,
        style: {
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 1001,
          cursor: 'pointer',
          border: isPlaying && !isMuted ? '3px solid #00ff00' : '2px solid rgba(255, 215, 0, 1)',
          boxShadow: isPlaying && !isMuted ? '0 0 20px rgba(0, 255, 0, 0.6)' : '0 8px 24px rgba(255, 215, 0, 0.4)',
          opacity: '1',
          visibility: 'visible',
          transform: 'translateY(0) scale(1)'
        },
        ref: iconRef,
        onClick: handleIconClick,
        title: isPlaying ? "🎵 Playing - Click to open queue, Double-click to mute" : "⏸️ Click to play, Double-click to unmute"
      },
        createSVGIcon('M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'),
        isMuted && React.createElement('div', {
          className: 'mute-indicator',
          style: {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(45deg)',
            width: '40px',
            height: '3px',
            background: '#ff4444',
            borderRadius: '2px',
            zIndex: 10,
            boxShadow: '0 0 4px rgba(255, 68, 68, 0.8)'
          }
        })
      ),
      
      // Playlist Panel
      React.createElement('div', {
        className: `playlist-panel left ${isOpen ? 'open' : ''}`,
        ref: panelRef
      },
        // Header with close button
        React.createElement('div', { className: 'playlist-header' },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' } },
            React.createElement('h2', null, "Starlord's MixTapes"),
            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              isAdminUser() && React.createElement('a', {
                href: `https://www.youtube.com/playlist?list=${YOUTUBE_PLAYLIST_ID}`,
                target: '_blank',
                rel: 'noopener noreferrer',
                title: 'View YouTube Playlist',
                style: { 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  padding: '6px 10px',
                  textDecoration: 'none',
                  color: '#ffd700',
                  border: '1px solid rgba(255, 215, 0, 0.3)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  background: 'rgba(255, 215, 0, 0.1)'
                },
                onMouseEnter: (e) => {
                  e.target.style.background = 'rgba(255, 215, 0, 0.2)';
                  e.target.style.textShadow = '0 0 8px rgba(255, 215, 0, 0.5)';
                },
                onMouseLeave: (e) => {
                  e.target.style.background = 'rgba(255, 215, 0, 0.1)';
                  e.target.style.textShadow = 'none';
                }
              }, '📺 Playlist'),
            React.createElement('button', {
              className: 'panel-control-btn',
              onClick: () => setIsOpen(false),
              title: 'Close'
            }, createSVGIcon('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'))
            )
          )
        ),
        
        // Now Playing
        currentSong && React.createElement('div', { className: 'now-playing' },
          React.createElement('div', { className: 'now-playing-label' }, 'PLAYING FROM: SPOTLIGHTED UPLOADS'),
          React.createElement('div', { className: 'now-playing-item' },
            React.createElement('div', { className: 'now-playing-art' },
              currentSong.albumArt 
                ? React.createElement('img', { src: currentSong.albumArt, alt: currentSong.title })
                : React.createElement('div', { 
                    className: 'default-art',
                    style: { 
                      width: '100%', 
                      height: '100%', 
                      background: 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,215,0,0.1))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    } 
                  }, createSVGIcon('M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z')),
              isPlaying && React.createElement('svg', { 
                className: 'play-icon', 
                viewBox: '0 0 24 24',
                fill: 'rgba(255, 215, 0, 1)',
                style: { position: 'absolute', width: '24px', height: '24px' }
              }, React.createElement('path', { d: 'M8 5v14l11-7z' }))
            ),
            React.createElement('div', { className: 'now-playing-info' },
              React.createElement('h3', { className: 'now-playing-title' },
                currentSong.title,
                React.createElement('span', { className: 'upload-indicator' })
              ),
              React.createElement('p', { className: 'now-playing-artist' }, currentSong.artist)
            ),
            React.createElement('button', {
              className: 'queue-remove-btn',
              onClick: (e) => {
                e.stopPropagation();
                skipSong(currentSong._id || currentSongIndex, currentSongIndex);
              },
              title: 'Skip song'
            }, createSVGIcon('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'))
          )
        ),
        
        // Next Up
        React.createElement('div', { className: 'next-up' },
          React.createElement('div', { className: 'next-up-label' }, 'NEXT UP FROM: SPOTLIGHTED UPLOADS'),
          isLoading && React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' } }, 'Loading playlist...'),
          React.createElement('ul', { className: 'queue-list' },
            playlist?.songs.map((song, index) => {
              if (index === currentSongIndex) return null;
              const isNext = index === (currentSongIndex + 1) % playlist.songs.length;
              
              return React.createElement('li', {
                key: song._id || index,
                className: `queue-item ${isNext ? 'next' : ''}`
              },
                React.createElement('div', { className: 'queue-art' },
                  song.albumArt
                    ? React.createElement('img', { src: song.albumArt, alt: song.title })
                    : React.createElement('div', { 
                        className: 'default-art',
                        style: { 
                          width: '100%', 
                          height: '100%', 
                          background: 'rgba(255,255,255,0.1)' 
                        } 
                      })
                ),
                React.createElement('div', { className: 'queue-info' },
                  React.createElement('h4', { className: 'queue-title' }, song.title),
                  React.createElement('p', { className: 'queue-artist' }, song.artist)
                ),
                React.createElement('div', { className: 'queue-actions' },
                  React.createElement('span', { className: 'upload-indicator' }),
                  React.createElement('button', {
                    className: 'queue-remove-btn',
                    onClick: (e) => {
                      e.stopPropagation();
                      skipSong(song._id || index, index);
                    },
                    title: 'Skip song'
                  }, createSVGIcon('M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'))
                )
              );
            })
          )
        )
      )
    );
  }

  // Initialize when DOM is ready
  function initMusicPlayer() {
    if (!window.React || !window.ReactDOM) {
      console.error('❌ React or ReactDOM not loaded - music player cannot initialize');
      setTimeout(() => {
        if (window.React && window.ReactDOM) {
          console.log('✅ React loaded, initializing music player...');
          initMusicPlayer();
        }
      }, 500);
      return;
    }

    let root = document.getElementById('music-player-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'music-player-root';
      document.body.appendChild(root);
    }
    
    try {
      const rootElement = ReactDOM.createRoot(root);
      rootElement.render(React.createElement(MusicPlayer));
      console.log('✅ Music player initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing music player:', error);
    }
  }

  // Wait for React to load, then initialize
  function waitForReact() {
    if (window.React && window.ReactDOM) {
      console.log('✅ React and ReactDOM found, initializing music player...');
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMusicPlayer);
      } else {
        // DOM already loaded, initialize immediately
        setTimeout(initMusicPlayer, 200);
      }
    } else {
      // Keep checking for React (max 10 seconds)
      const maxAttempts = 100;
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        if (window.React && window.ReactDOM) {
          clearInterval(checkInterval);
          console.log('✅ React loaded after ' + attempts + ' attempts, initializing...');
          initMusicPlayer();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.error('❌ React failed to load after 10 seconds. Music player will not initialize.');
        }
      }, 100);
    }
  }

  // Start waiting for React immediately
  waitForReact();
})();
