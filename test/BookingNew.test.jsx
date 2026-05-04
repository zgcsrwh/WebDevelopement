import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter, MemoryRouter, Routes, Route } from "react-router-dom";
import Facilities from "../src/pages/member/Facilities";
import BookingNew from "../src/pages/member/BookingNew";
import { AuthProvider, useAuth } from "../src/provider/AuthContext";
import * as bookingService from "../src/services/bookingService";
import {testViewFacility, clearCollection} from "./TestCommonFunc"
import { db } from "../src/provider/FirebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import * as partnerService from "../src/services/partnerService";

// Mock auth functions
vi.mock("../src/provider/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

// The testing functions are designed to be go through from facilities page
const renderComponent = () =>
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<Facilities />} />
            <Route path="/bookings/new" element={<BookingNew />} />
            <Route path="*" element={<BookingNew />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    );

//screen.logTestingPlaygroundURL();
describe("Facilities Filter Unit Test", () => {

    beforeEach(async () => {
        // Add a default user info
        useAuth.mockReturnValue({
          sessionProfile: { id: "default_test_user", name: "Default Test User" }
        });
        await testViewFacility();
    });

    afterEach(async () => {
        await clearCollection("facility");
        await clearCollection("time_slot");
    });

  it("Case_BookingNew_1: Click 'Book' to navigate to the new booking page", async () => {
 
    renderComponent();
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();

    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    
    // Check if information is the selected facility
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();
    expect(screen.getByText("Capacity: Max 3")).toBeInTheDocument();
    expect(screen.getByText("My Test Usage Guidelines")).toBeInTheDocument();
  });

  it("Case_BookingNew_2: Change a date and the time slots updated", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // Check the current time slot
    await screen.findByRole("option", { name: "07:00" });

    // Change the date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 10);

    // Change the date
    const dateInput = screen.getByLabelText(/Date/i);
    fireEvent.change(dateInput, { target: { value: tomorrowString } });

    // Validate the option is changed
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: "07:00" })).not.toBeInTheDocument();
    });
  });

  it("Case_BookingNew_3: Type in the Total Attendees value, automatically corrected to 1 if input 0", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // 1. Find the Total Attendees input field
    const attendeesInput = screen.getByLabelText(/Total Attendees/i);

    // 2. Try to input 0
    fireEvent.change(attendeesInput, { target: { value: "0" } });

    // 3. Verify it is automatically corrected to 1
    await waitFor(() => {
      expect(attendeesInput.value).toBe("1");
    });

  }); 

  it("Case_BookingNew_4: Type in the Total Attendees value, automatically corrected to max if input over max", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // 1. Find the Total Attendees input field
    const attendeesInput = screen.getByLabelText(/Total Attendees/i);

    // 2. Try to input 0
    fireEvent.change(attendeesInput, { target: { value: "4" } });

    // 3. Verify it is automatically corrected to 1
    await waitFor(() => {
      expect(attendeesInput.value).toBe("3");
    });

  }); 

   it("Case_BookingNew_5: Select a start time, the end time is automatically updated", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // 1. Wait for start time options to populate and select one
    await screen.findByRole("option", { name: "06:00" });
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    
    fireEvent.change(startTimeSelect, { target: { value: "06:00" } });

    // 2. Find the End Time input and verify it automatically updates to the matched end time
    const endTimeInput = screen.getByLabelText(/End Time/i);
    await waitFor(() => {
      expect(endTimeInput.value).toBe("07:00");
    });

  });  

   it("Case_BookingNew_6: Type in the description, the counting number is automatically updated", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    const descriptionInput = screen.getByLabelText(/Activity Description/i);
    fireEvent.change(descriptionInput, { target: { value: "ASDFGHJKL" } });

    // Validate the number matches exactly "9/100" format
    expect(await screen.findByText("9/100")).toBeInTheDocument();
  });  


   it("Case_BookingNew_7: Type in the description with over 100 characters, the input is ignored automatically", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    const descriptionInput = screen.getByLabelText(/Activity Description/i);
    
    // Generate a string with 105 characters
    const overLimitText = "A".repeat(101);
    fireEvent.change(descriptionInput, { target: { value: overLimitText } });

    // Validate that the input is ignored due to > 100 characters limit, so it stays at 0/100
    await waitFor(() => {
      expect(descriptionInput.value).toBe("");
      expect(screen.getByText("0/100")).toBeInTheDocument();
    });
  }); 
  
it("Case_BookingNew_8: Submit when ‘Total Attendees’ is empty, report error message", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

   
    // Fill in the blanks
    // Total attendees
    fireEvent.change(screen.getByLabelText(/Total Attendees/i), { target: { value: "" } });

    // Start time
    await screen.findByRole("option", { name: "06:00" });
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeSelect, { target: { value: "06:00" } });

    // Activity Description
    fireEvent.change(screen.getByLabelText(/Activity Description/i), { target: { value: "AAA" } });
    

    // Submit the form
    const submitBtn = screen.getByRole("button", { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    // Validate the resulting error message
    expect(await screen.findByText(/Total attendees must be at least 1/i)).toBeInTheDocument();

  });

  it("Case_BookingNew_9: Submit when 'Start Time' is empty, the button is disabled", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    

    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

   
    // Fill in the blanks
    // Total attendees
    fireEvent.change(screen.getByLabelText(/Total Attendees/i), { target: { value: "1" } });

    // Start time
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeSelect, { target: { value: "" } });

    // Activity Description
    fireEvent.change(screen.getByLabelText(/Activity Description/i), { target: { value: "AAA" } });
    
    // Validate that the Submit button is disabled
    const submitBtn = screen.getByRole("button", { name: /Submit Request/i });
    expect(submitBtn).toBeDisabled();

  });

  it("Case_BookingNew_10: Submit when 'Description' is empty, report error message", async () => {
 
    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    
    // Check if nagigation complete
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // Fill in the blanks
    // Total attendees
    fireEvent.change(screen.getByLabelText(/Total Attendees/i), { target: { value: "1" } });

    // Start time
    await screen.findByRole("option", { name: "06:00" });
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeSelect, { target: { value: "06:00" } });

    // Activity Description
    fireEvent.change(screen.getByLabelText(/Activity Description/i), { target: { value: "" } });
    
    // Submit the form
    const submitBtn = screen.getByRole("button", { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    // Validate the resulting error message
    expect(await screen.findByText(/Please enter a short activity description before submitting the booking request/i)).toBeInTheDocument();
  });

  /*************************      Invite Partners           ***************************** */
  it("Case_BookingNew_11: Invite function disabled when Total Attendees is 1", async () => {
 
    // Mock a member identity
    const customUser = { id: "custom_auth_user_999", name: "Custom Identity User", email: "custom@test.com" };
    useAuth.mockReturnValue({
      sessionProfile: customUser,
    });

    // Mock a profile and friends list
    vi.spyOn(partnerService, "getCurrentMatchProfile").mockResolvedValue({ openMatch: true });
    vi.spyOn(partnerService, "getFriendProfiles").mockResolvedValue([
      { id: "friend_1", status: "active", nickname: "Test Buddy", sport: "Tennis", availability: ["Monday_morning"] }
    ]);

    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // Fill in blanks
    fireEvent.change(screen.getByLabelText(/Total Attendees/i), { target: { value: "1" } });
    await screen.findByRole("option", { name: "06:00" });
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeSelect, { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText(/Activity Description/i), { target: { value: "Test request" } });
    
    // Validate that the Invite Partners button is disabled
    const inviteBtn = screen.getByRole("button", { name: /Invite Partners/i });
    expect(inviteBtn).toBeDisabled();
    expect(screen.getByText(/Increase total attendees above 1 to invite partners\./i)).toBeInTheDocument();
  });

  it("Case_BookingNew_12: Invite function disabled when member has no friends", async () => {
 
    // Mock a member identity
    const customUser = { id: "custom_auth_user_999", name: "Custom Identity User", email: "custom@test.com" };
    useAuth.mockReturnValue({
      sessionProfile: customUser,
    });

    // Mock a profile and friends list
    vi.spyOn(partnerService, "getCurrentMatchProfile").mockResolvedValue({ openMatch: true });
    vi.spyOn(partnerService, "getFriendProfiles").mockResolvedValue([ ]);

    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // Fill in blanks
    fireEvent.change(screen.getByLabelText(/Total Attendees/i), { target: { value: "2" } });
    await screen.findByRole("option", { name: "06:00" });
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeSelect, { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText(/Activity Description/i), { target: { value: "Test request" } });
    
    // Validate that the Invite Partners button is disabled
    const inviteBtn = screen.getByRole("button", { name: /Invite Partners/i });
    expect(inviteBtn).toBeDisabled();
    expect(screen.getByText(/You need at least one accepted friend before inviting partners\./i)).toBeInTheDocument();
  });

  it("Case_BookingNew_13: Select friends", async () => {
 
    // Mock a member identity
    const customUser = { id: "custom_auth_user_999", name: "Custom Identity User", email: "custom@test.com" };
    useAuth.mockReturnValue({
      sessionProfile: customUser,
    });

    // Mock a profile and friends list
    vi.spyOn(partnerService, "getCurrentMatchProfile").mockResolvedValue({ openMatch: true });
    vi.spyOn(partnerService, "getFriendProfiles").mockResolvedValue([
      { id: "friend_1", status: "active", nickname: "Test Buddy", sport: "Tennis", availability: ["Monday_morning"] }
    ]);

    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // Fill in blanks
    fireEvent.change(screen.getByLabelText(/Total Attendees/i), { target: { value: "2" } });
    await screen.findByRole("option", { name: "06:00" });
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeSelect, { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText(/Activity Description/i), { target: { value: "Test request" } });
    
    const submitSpy = vi.spyOn(bookingService, "submitBookingRequest");

    // Click the combo box of friends
    const inviteBtn = screen.getByRole("button", { name: /Invite Partners/i });
    fireEvent.click(inviteBtn);
    
    const friendCheckbox = await screen.findByRole("checkbox", { name: /Test Buddy/i });
    fireEvent.click(friendCheckbox);

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Submit Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1);
      const payload = submitSpy.mock.calls[0][0];
      const passedProfile = submitSpy.mock.calls[0][1];
      
      // Validate if friend information submit to the form
      expect(payload.user_id_list).toEqual(["friend_1"]);
      expect(passedProfile.id).toBe("custom_auth_user_999");
      expect(passedProfile.name).toBe("Custom Identity User");
    });
  });

  it("Case_BookingNew_14: Select friends(Plus user itself)more than attendees", async () => {
 
    // Mock a member identity
    const customUser = { id: "custom_auth_user_999", name: "Custom Identity User", email: "custom@test.com" };
    useAuth.mockReturnValue({
      sessionProfile: customUser,
    });

    // Mock a profile and friends list
    vi.spyOn(partnerService, "getCurrentMatchProfile").mockResolvedValue({ openMatch: true });
    vi.spyOn(partnerService, "getFriendProfiles").mockResolvedValue([
      { id: "friend_1", status: "active", nickname: "Test Buddy", sport: "Tennis", availability: ["Monday_morning"] },
      { id: "friend_2", status: "active", nickname: "Test Buddy2", sport: "Tennis", availability: ["Monday_morning"] }
    ]);

    renderComponent();

    // navigate to the Booking New
    expect(await screen.findByText("Browse available sports venues and make a reservation.")).toBeInTheDocument();
    const viewBookLinks = await screen.findAllByRole("link", { name: /Book/i });
    fireEvent.click(viewBookLinks[0]);
    expect(await screen.findByText(/Test Venue/i)).toBeInTheDocument();

    // Fill in blanks
    fireEvent.change(screen.getByLabelText(/Total Attendees/i), { target: { value: "2" } });
    await screen.findByRole("option", { name: "06:00" });
    const startTimeSelect = screen.getByLabelText(/Start Time/i);
    fireEvent.change(startTimeSelect, { target: { value: "06:00" } });
    fireEvent.change(screen.getByLabelText(/Activity Description/i), { target: { value: "Test request" } });
    
    // Click the combo box of friends
    const inviteBtn = screen.getByRole("button", { name: /Invite Partners/i });
    fireEvent.click(inviteBtn);
    
    // Get all checkboxes and try to select more friends than the attendee limit (which is 2 - 1 = 1)
    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    // Validate that an error message appears immediately and prevents selecting more friends
    expect(await screen.findByText(/You cannot invite more friends because the attendee limit has already been reached\./i)).toBeInTheDocument();
  });
});
