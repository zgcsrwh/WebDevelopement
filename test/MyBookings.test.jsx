import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import MyBookings from "../src/pages/member/MyBookings";
import { AuthProvider, useAuth } from "../src/provider/AuthContext";
import * as bookingService from "../src/services/bookingService";
import { testViewBookings, clearCollection, testLoginMember, testLogout } from './TestCommonFunc';

vi.mock("../src/provider/AuthContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

const renderComponent = () =>
    render(
      <AuthProvider>
        <BrowserRouter>
          <MyBookings />
        </BrowserRouter>
      </AuthProvider>
);

//screen.logTestingPlaygroundURL();
describe("MyBookings Component Unit Test", () => {

    beforeEach(async () => {
        await testViewBookings();
        await testLoginMember();
    });

    afterEach(async () => {
        await clearCollection("request");
        await clearCollection("facility");
        await clearCollection("time_slot");
        await testLogout();
    });

  it("Case_MyBookings_1: The visual information check:All the historical bookings are listed in the page", async () => {

    // Wait for rendering
    renderComponent();
    expect(await screen.findByText(/My Bookings/i)).toBeInTheDocument();
    
    // Wait for Loading 
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });
    
    // Verify if all requests show up
    const venues = await screen.findAllByText(/Test Venue/i);
    expect(venues.length).toBe(7);
    
    // Expect 2 for each because: 1 in the Filter Dropdown <select>, and 1 rendered in the booking card
    expect(screen.getAllByText(/pending/i).length).toBe(2);
    expect(screen.getAllByText(/upcoming/i).length).toBe(2);
    expect(screen.getAllByText(/rejected/i).length).toBe(2);
    expect(screen.getAllByText(/alternative suggested/i).length).toBe(2);
    expect(screen.getAllByText(/cancelled/i).length).toBe(2);
    expect(screen.getAllByText(/no show/i).length).toBe(2);
    expect(screen.getAllByText(/completed/i).length).toBe(2);
  });

   it("Case_MyBookings_2: The visual information check:Bookings with status = 'pending' also has the button of 'Withdraw Request'", async () => {
    renderComponent();
    expect(await screen.findByText(/My Bookings/i)).toBeInTheDocument();
    
    // Wait for Loading 
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });
        
    // Find the Withdraw Request button
    const withdrawBtn = screen.getByRole("button", { name: /Withdraw Request/i });
    expect(withdrawBtn).toBeInTheDocument();

    // Verify that the "pending" status text is located inside the exact same booking card
    const bookingCard = withdrawBtn.closest("article");
    expect(within(bookingCard).getByText(/pending/i)).toBeInTheDocument();
  });

  it("Case_MyBookings_3: The visual information check:Bookings with status = 'upcoming' also has the button of 'Cancel Booking'", async () => {
    
    renderComponent();
    expect(await screen.findByText(/My Bookings/i)).toBeInTheDocument();
    
    // Wait for Loading 
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });
        
    // Find the Cancel Booking button
    const cancelBtn = screen.getByRole("button", { name: /Cancel Booking/i });
    expect(cancelBtn).toBeInTheDocument();

    // Verify that the "upcoming" status text is located inside the exact same booking card
    const bookingCard = cancelBtn.closest("article");
    expect(within(bookingCard).getByText(/upcoming/i)).toBeInTheDocument();
  });

  it("Case_MyBookings_4: Apply the filter of 'status' - Only the bookings with the selected status are displayed", async () => {
    
    renderComponent();
    expect(await screen.findByText(/My Bookings/i)).toBeInTheDocument();
    
    // Wait for Loading 
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Status/i), { target: { value: "completed" } });

    const venues = await screen.findAllByText(/Test Venue/i);
    expect(venues.length).toBe(1);
  });

 it("Case_MyBookings_5: Apply the filter of 'Date' - Only the bookings which attendent data = selected date are displayed", async () => {
    renderComponent();
    expect(await screen.findByText(/My Bookings/i)).toBeInTheDocument();
    
    // Wait for Loading 
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().slice(0, 10);

    fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: yesterdayString } });
  
    await waitFor(() => {
      const venues = screen.getAllByText(/Test Venue/i);
      expect(venues.length).toBe(2);
    });
  });

  it("Case_MyBookings_6: Apply a filter, and then click button 'Clear'", async () => {
    renderComponent();
    expect(await screen.findByText(/My Bookings/i)).toBeInTheDocument();
    
    // Wait for Loading 
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    // Apply a filter 
    const statusSelect = screen.getByLabelText(/Status/i);
    fireEvent.change(statusSelect, { target: { value: "completed" } });

    // Wait for the filter to take effect (only 1 item should display)
    await waitFor(() => {
      const venues = screen.getAllByText(/Test Venue/i);
      expect(venues.length).toBe(1);
    });

    // Click the Clear button
    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));

    // Verify that the select input resets to default and all data returns
    await waitFor(() => {
      expect(statusSelect.value).toBe("all");
      const venues = screen.getAllByText(/Test Venue/i);
      expect(venues.length).toBe(7);
    });
  });

  it("Case_MyBookings_7: Click the button 'Withdraw Request'", async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    const withdrawBtn = screen.getByRole("button", { name: /Withdraw Request/i });
    fireEvent.click(withdrawBtn);

    expect(screen.getByText(/Do you want to withdraw this pending request\?/i)).toBeInTheDocument();
  });

  it("Case_MyBookings_8: Click the button 'Withdraw Request', then click the button 'Keep Booking'", async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    const withdrawBtn = screen.getByRole("button", { name: /Withdraw Request/i });
    fireEvent.click(withdrawBtn);

    // Click the keep booking
    const dialog = screen.getByRole("dialog");
    const keepBookingBtn = within(dialog).getByRole("button", { name: /Keep Booking/i });
    fireEvent.click(keepBookingBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Case_MyBookings_9: Click the button 'Withdraw Request', then click the button 'Withdraw Request'", async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    const withdrawSpy = vi.spyOn(bookingService, "withdrawPendingBooking");

    const withdrawBtn = screen.getByRole("button", { name: /Withdraw Request/i });
    fireEvent.click(withdrawBtn);

    // Click withdraw
    const dialog = screen.getByRole("dialog");
    const confirmWithdrawBtn = within(dialog).getByRole("button", { name: /Withdraw Request/i });
    fireEvent.click(confirmWithdrawBtn);

    await waitFor(() => {
      expect(withdrawSpy).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    
  });

  it("Case_MyBookings_10: Click the button 'Cancel Booking' - A window opened and warning 'Do you want to cancel this upcoming booking?'", async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole("button", { name: /Cancel Booking/i });
    fireEvent.click(cancelBtn);

    expect(screen.getByText(/Do you want to cancel this upcoming booking\?/i)).toBeInTheDocument();
  });

  it("Case_MyBookings_11: Click the button 'Cancel Booking', then in the open window click the button 'Keep Booking' - Window close, the status of booking does not changed", async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole("button", { name: /Cancel Booking/i });
    fireEvent.click(cancelBtn);

    const dialog = screen.getByRole("dialog");
    const keepBookingBtn = within(dialog).getByRole("button", { name: /Keep Booking/i });
    fireEvent.click(keepBookingBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Case_MyBookings_12: Click the button 'Cancel Booking', then in the open window click the button 'Cancel Booking' - Window close, The status of booking becomes 'cancelled'", async () => {
    renderComponent();
    
    await waitFor(() => {
      expect(screen.queryByText(/Loading your booking records/i)).not.toBeInTheDocument();
    });

    const cancelSpy = vi.spyOn(bookingService, "cancelConfirmedBooking");

    const cancelBtn = screen.getByRole("button", { name: /Cancel Booking/i });
    fireEvent.click(cancelBtn);

    const dialog = screen.getByRole("dialog");
    const confirmCancelBtn = within(dialog).getByRole("button", { name: /Cancel Booking/i });
    fireEvent.click(confirmCancelBtn);

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

  });
  
});