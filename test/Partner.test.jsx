import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Partner from "../src/pages/member/Partner";
import { AuthProvider, useAuth } from "../src/provider/AuthContext";
import * as partnerService from "../src/services/partnerService";
import * as bookingService from "../src/services/bookingService";
import {testViewProfile, clearCollection, testLoginMember, testLogout} from "./TestCommonFunc"

// Mock AuthContext
vi.mock("../src/provider/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

vi.mock("../src/services/bookingService", () => ({
  getFacilitySportTypes: vi.fn(),
}));

// Mock avatar utils to ensure exactly 6 avatars are returned for the test
vi.mock("../src/utils/avatar", () => ({
  getAvatarOptions: () => [
    { id: "1", label: "Avatar 1", src: "avatar1.png" },
    { id: "2", label: "Avatar 2", src: "avatar2.png" },
    { id: "3", label: "Avatar 3", src: "avatar3.png" },
    { id: "4", label: "Avatar 4", src: "avatar4.png" },
    { id: "5", label: "Avatar 5", src: "avatar5.png" },
    { id: "6", label: "Avatar 6", src: "avatar6.png" },
  ],
  getAvatarIdForActor: vi.fn(() => "1"),
  getAvatarForActor: vi.fn(() => "avatar1.png"),
  setStoredAvatarId: vi.fn(),
}));

const renderComponent = () =>
  render(
    <AuthProvider>
      <BrowserRouter>
        <Partner />
      </BrowserRouter>
    </AuthProvider>
  );

describe("Partner Component Unit Test", () => {
  beforeEach(async () => {
    await testLoginMember();
    await clearCollection("profile");

    // Mock data for sport types
    bookingService.getFacilitySportTypes.mockResolvedValue(["Tennis", "Basketball", "Soccer"]);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await clearCollection("profile");
    await testLogout();
  });

  it("Case_Partner_1: Have no profile before - The default status of 'Enable Partner Matching' switch should be 'closed'", async () => {
    renderComponent();

    // Wait for the loading to finish
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Find the toggle switch and verify its status is "false" (closed)
    const switchBtn = screen.getByRole("button", { name: /partner matching/i });
    expect(switchBtn).toHaveAttribute("aria-pressed", "false");
    expect(switchBtn).not.toHaveClass("partner-switch--active");
  });

  it("Case_Partner_2: Have no profile before, click the 'Enable Partner Matching' switch - Display Error info", async () => {
    renderComponent();

    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Click the switch
    const switchBtn = screen.getByRole("button", { name: /partner matching/i });
    fireEvent.click(switchBtn);

    // Verify the error message displays
    expect(await screen.findByText("Please complete your profile first.")).toBeInTheDocument();
  });

  it("Case_Partner_3: Click the 'Change Avatar' button, and then click again - Display the Avatar lists first, having 6 avatars in total; Then the list closed", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    const changeAvatarBtn = screen.getByRole("button", { name: /Change Avatar/i });
    
    // Click to open
    fireEvent.click(changeAvatarBtn);
    
    // Verify 6 avatars are displayed
    const avatarGrid = await screen.findByText("Avatar 1"); // Found inside the grid
    const avatarButtons = avatarGrid.closest(".partner-avatarGrid").querySelectorAll("button");
    expect(avatarButtons.length).toBe(6);

    // Click to close
    fireEvent.click(changeAvatarBtn);
    
    // Verify the list is closed
    await waitFor(() => {
      expect(screen.queryByText("Avatar 1")).not.toBeInTheDocument();
    });
  });

  it("Case_Partner_4: Click the 'Change Avatar' button, select an Avatar - The selected Avatar displayed", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Change Avatar/i }));
    
    // Select Avatar 2
    const avatar2Btn = await screen.findByRole("button", { name: /Avatar 2/i });
    fireEvent.click(avatar2Btn);
    
    // The selected avatar gets the active class
    expect(avatar2Btn).toHaveClass("partner-avatarOption--active");
  });

  it("Case_Partner_5: Type in the 'Short Bio' blank - The maximum characters num is limited to 150", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    const bioInput = screen.getByLabelText(/Short Bio/i);
    
    // Type 151 characters
    fireEvent.change(bioInput, { target: { value: "A".repeat(151) } });
    
    // Verify the error message limits the input validity
    expect(await screen.findByText("Short bio must be 150 characters or fewer.")).toBeInTheDocument();
  });

  it("Case_Partner_6: Click the button of Sports Interests, and then click again - The button color high-lighted; then turn back to original", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    const tennisBtn = await screen.findByRole("button", { name: "Tennis" });
    
    // Initial state: not active
    expect(tennisBtn).not.toHaveClass("partner-interestButton--active");
    
    // Click to select
    fireEvent.click(tennisBtn);
    expect(tennisBtn).toHaveClass("partner-interestButton--active");
    
    // Click to deselect
    fireEvent.click(tennisBtn);
    expect(tennisBtn).not.toHaveClass("partner-interestButton--active");
  });

  it("Case_Partner_7: The first availability combo has 'Monday' to 'Sunday' - The list info should be correct", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    const selects = screen.getAllByRole("combobox");
    const daySelect = selects[0]; // First combo is Day
    
    const options = Array.from(daySelect.options).map(opt => opt.text);
    expect(options).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  });

  it("Case_Partner_8: The second availability combo has 'Morning', 'Afternoon' and 'Evening' - The list info should be correct", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    const selects = screen.getAllByRole("combobox");
    const periodSelect = selects[1]; // Second combo is Period
    
    const options = Array.from(periodSelect.options).map(opt => opt.text);
    expect(options).toEqual(["Morning", "Afternoon", "Evening"]);
  });

  it("Case_Partner_9: Option Add", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    const selects = screen.getAllByRole("combobox");
    const daySelect = selects[0];
    const periodSelect = selects[1];
    const addBtn = screen.getByRole("button", { name: "+" });

    fireEvent.change(daySelect, { target: { value: "monday" } });
    fireEvent.change(periodSelect, { target: { value: "morning" } });
    fireEvent.click(addBtn);
    
    screen.logTestingPlaygroundURL();
    expect(await screen.findByText("Monday Morning")).toBeInTheDocument();
  });

    it("Case_Partner_10: Option +Remove", async () => {
        renderComponent();
        expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

        const selects = screen.getAllByRole("combobox");
        const daySelect = selects[0];
        const periodSelect = selects[1];
        const addBtn = screen.getByRole("button", { name: "+" });


        fireEvent.change(daySelect, { target: { value: "monday" } });
        fireEvent.change(periodSelect, { target: { value: "morning" } });
        fireEvent.click(addBtn);
        
        expect(await screen.findByText("Monday Morning")).toBeInTheDocument();

        // --- Case 10: Add an option, and then click the "Remove" ---
        const removeBtn = screen.getByRole("button", { name: "Remove" });
        fireEvent.click(removeBtn);
        
        await waitFor(() => {
        expect(screen.queryByText("Monday Morning")).not.toBeInTheDocument();
        });
    });

    it("Case_Partner_11: Duplicate Option", async () => {
        renderComponent();
        expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

        const selects = screen.getAllByRole("combobox");
        const daySelect = selects[0];
        const periodSelect = selects[1];
        const addBtn = screen.getByRole("button", { name: "+" });


        fireEvent.change(daySelect, { target: { value: "monday" } });
        fireEvent.change(periodSelect, { target: { value: "morning" } });
        fireEvent.click(addBtn);
        
        expect(await screen.findByText("Monday Morning")).toBeInTheDocument();

        fireEvent.click(addBtn); // Add again
        expect(await screen.findByText("Availability options cannot repeat.")).toBeInTheDocument();
    });

    it("Case_Partner_12: Over Max Limit", async () => {
        renderComponent();
        expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

        const selects = screen.getAllByRole("combobox");
        const daySelect = selects[0];
        const periodSelect = selects[1];
        const addBtn = screen.getByRole("button", { name: "+" });


        fireEvent.change(daySelect, { target: { value: "monday" } });
        fireEvent.change(periodSelect, { target: { value: "morning" } });
        fireEvent.click(addBtn);   
        expect(await screen.findByText("Monday Morning")).toBeInTheDocument();

        fireEvent.change(daySelect, { target: { value: "wednesday" } });
        fireEvent.click(addBtn); 
        expect(await screen.findByText("Wednesday Morning")).toBeInTheDocument();
        
        fireEvent.change(daySelect, { target: { value: "thursday" } });
        fireEvent.click(addBtn); 
        expect(await screen.findByText("Thursday Morning")).toBeInTheDocument();

        fireEvent.change(daySelect, { target: { value: "friday" } });
        fireEvent.click(addBtn); 
        expect(await screen.findByText("You can add up to 3 availability options.")).toBeInTheDocument();
    });    

      it("Case_Partner_13: Fill in the information, let the 'Display Nickname' as empty; Click 'Save Profile' button", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Fill Bio, Interests, and Availability, but leave Nickname empty
    fireEvent.change(screen.getByLabelText(/Short Bio/i), { target: { value: "I am a test user." } });
    fireEvent.click(await screen.findByRole("button", { name: "Tennis" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    // Click Save
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    expect(await screen.findByText("Please fix the highlighted profile fields before saving.")).toBeInTheDocument();
    expect(await screen.findByText("Please enter a nickname.")).toBeInTheDocument();
  });

  it("Case_Partner_14: Fill in the information, let the 'Short Bio' as empty; Click 'Save Profile' button", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Fill Nickname, Interests, and Availability, but leave Bio empty
    fireEvent.change(screen.getByLabelText(/Display Nickname/i), { target: { value: "TestNick" } });
    fireEvent.click(await screen.findByRole("button", { name: "Tennis" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    // Click Save
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    expect(await screen.findByText("Please fix the highlighted profile fields before saving.")).toBeInTheDocument();
    expect(await screen.findByText("Please enter a short bio.")).toBeInTheDocument();
  });

  it("Case_Partner_15: Fill in the information, let the 'Sports Interests' as empty; Click 'Save Profile' button", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Fill Nickname, Bio, and Availability, but leave Interests empty
    fireEvent.change(screen.getByLabelText(/Display Nickname/i), { target: { value: "TestNick" } });
    fireEvent.change(screen.getByLabelText(/Short Bio/i), { target: { value: "I am a test user." } });
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    // Click Save
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    expect(await screen.findByText("Please fix the highlighted profile fields before saving.")).toBeInTheDocument();
    expect(await screen.findByText("Please select at least one sports interest.")).toBeInTheDocument();
  });

  it("Case_Partner_16: Fill in the information, let the 'Availability' as empty; Click 'Save Profile' button", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Fill Nickname, Bio, and Interests, but leave Availability empty (it's empty by default)
    fireEvent.change(screen.getByLabelText(/Display Nickname/i), { target: { value: "TestNick" } });
    fireEvent.change(screen.getByLabelText(/Short Bio/i), { target: { value: "I am a test user." } });
    fireEvent.click(await screen.findByRole("button", { name: "Tennis" }));

    // Click Save
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    expect(await screen.findByText("Please fix the highlighted profile fields before saving.")).toBeInTheDocument();
    expect(await screen.findByText("Please add at least one availability option.")).toBeInTheDocument();
  });

  it("Case_Partner_17: Fill in the valid information; Click 'Save Profile' button - Display information : 'Profile saved successfully.'", async () => {
    // 使用局部 Spy 拦截后端的写入操作，模拟保存成功
    const upsertSpy = vi.spyOn(partnerService, "upsertMatchProfile").mockResolvedValue({});
    renderComponent();
    
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Fill all valid information
    fireEvent.change(screen.getByLabelText(/Display Nickname/i), { target: { value: "TestNick" } });
    fireEvent.change(screen.getByLabelText(/Short Bio/i), { target: { value: "I am a test user." } });
    fireEvent.click(await screen.findByRole("button", { name: "Tennis" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    // Click Save
    fireEvent.click(screen.getByRole("button", { name: /Save Profile/i }));

    // Verify success message
    expect(await screen.findByText("Profile saved successfully.")).toBeInTheDocument();
    
    // 测试结束后清理 Spy，防止影响其他测试
    upsertSpy.mockRestore();
  });

  it("Case_Partner_18: In the page of partner, do not saved profile before - Click 'Live Preview' button - Show the invalid profile information", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Click Live Preview toggle
    const previewBtn = screen.getByRole("button", { name: /Show live preview/i });
    fireEvent.click(previewBtn);

    // Verify placeholder information is shown
    expect(await screen.findByText("Your nickname")).toBeInTheDocument();
    expect(screen.getByText("Your live profile preview will appear here once you start editing.")).toBeInTheDocument();
    expect(screen.getByText("No interests selected yet.")).toBeInTheDocument();
    expect(screen.getByText("No availability selected yet.")).toBeInTheDocument();
  });

  it("Case_Partner_19: In the page of partner, having saved profile before - Click 'Live Preview' button - Show the live profile information", async () => {
    await testViewProfile();
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Click Live Preview toggle
    const previewBtn = screen.getByRole("button", { name: /Show live preview/i });
    fireEvent.click(previewBtn);

    // Verify the live profile information is populated correctly
    expect(await screen.findByText("AceSpiker")).toBeInTheDocument();
    //expect(screen.getByText(/Intermediate badminton player/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/Intermediate badminton player/i)).length).toBe(2);
    expect((await screen.findAllByText("Badminton")).length).toBe(1);
    expect((await screen.findAllByText("Tennis")).length).toBe(2);
    expect((await screen.findAllByText("Swimming")).length).toBe(1);
    expect((await screen.findAllByText(/Monday Evening/i)).length).toBe(2);
  });

  it("Case_Partner_20: In the page of partner, do not saved profile before - Click 'View Recommendations' button - Display Error info", async () => {
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View Recommendations/i }));
    expect(await screen.findByText("Please complete your profile and enable matching first.")).toBeInTheDocument();
  });

  it("Case_Partner_21: In the page of partner, having saved profile before - Set the 'Enable Partner Matching' as false, and then click 'View Recommendations' button", async () => {
    await testViewProfile();
    
    const toggleSpy = vi.spyOn(partnerService, "toggleMatchStatus").mockResolvedValue({});
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    // Wait for the profile to load and the switch to be active
    const switchBtn = await screen.findByRole("button", { name: /partner matching/i });
    expect(switchBtn).toHaveAttribute("aria-pressed", "true");

    // Toggle it off
    fireEvent.click(switchBtn);
    expect(await screen.findByText("Partner matching disabled.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View Recommendations/i }));
    expect(await screen.findByText("Please complete your profile and enable matching first.")).toBeInTheDocument();
    
    toggleSpy.mockRestore();
  });

  it("Case_Partner_22: In the page of partner, having saved profile before - Set the 'Enable Partner Matching' as true, and then click 'View Recommendations' button", async () => {
    await testViewProfile();
    renderComponent();
    expect(await screen.findByText("Enable Partner Matching")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View Recommendations/i }));
    
    // If navigation succeeds, the error message should NOT be triggered
    await waitFor(() => {
      expect(screen.queryByText("Please complete your profile and enable matching first.")).not.toBeInTheDocument();
    });
  });

});