import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useUpdateMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { UserPageCustomizationCard } from "@/components/layout/UserPageCustomizationCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Instagram, Youtube, Twitter, Music2, Tv, Github, Linkedin } from "lucide-react";

export default function SettingsPage() {
  const { currentUser, isLoading: isUserLoading } = useCurrentUser();
  const { data: siteSettings } = useSiteSettings();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentUser) {
      setUsername(currentUser.username || "");
      setBio(currentUser.bio || "");
      setWebsite(currentUser.website || "");
      setSocialLinks((currentUser.socialLinks as Record<string, string>) || {});
    }
  }, [currentUser]);

  const updateMe = useUpdateMe({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Profile updated", description: "Your changes have been saved." });
      },
      onError: (error: any) => {
        const message = error?.response?.data?.error || "Failed to update profile";
        toast({ title: "Error", description: message, variant: "destructive" });
      },
    },
  });

  const handleSocialChange = (platform: string, value: string) => {
    setSocialLinks((prev) => ({ ...prev, [platform]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const filteredSocialLinks = Object.fromEntries(
      Object.entries(socialLinks).filter(([, value]) => value && value.trim() !== ""),
    );

    updateMe.mutate({
      data: {
        username: username || undefined,
        bio: bio || undefined,
        website: website || undefined,
        socialLinks: Object.keys(filteredSocialLinks).length > 0 ? filteredSocialLinks : undefined,
      },
    });
  };

  if (isUserLoading) {
    return <div className="container mx-auto max-w-2xl px-4 py-16 text-center">Loading settings...</div>;
  }

  if (!currentUser) {
    setLocation("/sign-in");
    return null;
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      {currentUser && siteSettings ? (
        <div className="mb-6">
          <UserPageCustomizationCard user={currentUser} siteSettings={siteSettings} />
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your public profile details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">@</span>
                <Input
                  id="username"
                  className="pl-7"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                />
              </div>
              <p className="text-xs text-muted-foreground">Alphanumeric and underscores only (3-30 characters).</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell the world about yourself..."
                className="resize-none h-24"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
              />
              <div className="text-right text-xs text-muted-foreground">
                {bio.length}/500
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="website"
                  className="pl-9"
                  placeholder="https://yourwebsite.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Social Links</CardTitle>
            <CardDescription>Add links to your other platforms.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <div className="relative">
                  <Instagram className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="instagram"
                    className="pl-9"
                    placeholder="https://instagram.com/yourhandle"
                    value={socialLinks.instagram || ""}
                    onChange={(e) => handleSocialChange("instagram", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitter">X (formerly Twitter)</Label>
                <div className="relative">
                  <Twitter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="twitter"
                    className="pl-9"
                    placeholder="https://x.com/yourhandle"
                    value={socialLinks.twitter || ""}
                    onChange={(e) => handleSocialChange("twitter", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="youtube">YouTube</Label>
                <div className="relative">
                  <Youtube className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="youtube"
                    className="pl-9"
                    placeholder="https://youtube.com/@yourchannel"
                    value={socialLinks.youtube || ""}
                    onChange={(e) => handleSocialChange("youtube", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tiktok">TikTok</Label>
                <div className="relative">
                  <Music2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="tiktok"
                    className="pl-9"
                    placeholder="https://tiktok.com/@yourhandle"
                    value={socialLinks.tiktok || ""}
                    onChange={(e) => handleSocialChange("tiktok", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitch">Twitch</Label>
                <div className="relative">
                  <Tv className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="twitch"
                    className="pl-9"
                    placeholder="https://twitch.tv/yourchannel"
                    value={socialLinks.twitch || ""}
                    onChange={(e) => handleSocialChange("twitch", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="github">GitHub</Label>
                <div className="relative">
                  <Github className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="github"
                    className="pl-9"
                    placeholder="https://github.com/yourhandle"
                    value={socialLinks.github || ""}
                    onChange={(e) => handleSocialChange("github", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedin">LinkedIn</Label>
                <div className="relative">
                  <Linkedin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="linkedin"
                    className="pl-9"
                    placeholder="https://linkedin.com/in/yourhandle"
                    value={socialLinks.linkedin || ""}
                    onChange={(e) => handleSocialChange("linkedin", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t p-6">
            <Button type="submit" disabled={updateMe.isPending}>
              {updateMe.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
