package verb.core;

import verb.core.types.SurfaceData;
import verb.core.types.CurveData;

@:expose("core.Make")
class Make {

    // Generate the control points, weights, and knots of a swept surface
    //
    // **params**
    // + profile CurveData
    // + rail CurveData
    //
    // **returns**
    // + SurfaceData object
    //
    public static function sweep1_surface( profile : CurveData, rail : CurveData ) : SurfaceData {

        // for each point on rail, move all of the points
        var rail_start = Eval.rational_curve_point( rail, 0.0 )
        , span = 1.0 / rail.controlPoints.length
        , control_points = []
        , weights = []
        , rail_weights = Eval.weight_1d( rail.controlPoints )
        , profile_weights = Eval.weight_1d( profile.controlPoints )
        , profile_points = Eval.dehomogenize_1d( profile.controlPoints );

        for ( i in 0...rail.controlPoints.length ){

            // evaluate the point on the curve, subtracting it from the first point
            var rail_point = Eval.rational_curve_point( rail, i * span )
                , rail_offset = Vec.sub( rail_point, rail_start )
                , row_control_points = []
                , row_weights = [];

            for ( j in 0...profile.controlPoints.length ){

                row_control_points.push( Vec.add(rail_offset, profile_points[j] ) );
                row_weights.push( profile_weights[j] * rail_weights[i] );

            }

            control_points.push( row_control_points);
            weights.push( row_weights );
        }

        return new SurfaceData( rail.degree, profile.degree, rail.knots, profile.knots, Eval.homogenize_2d( control_points, weights) );
    }


    //
    // Generate the control points, weights, and knots of an elliptical arc
    //
    // **params**
    // + the center
    // + the xaxis
    // + orthogonal yaxis
    // + xradius of the ellipse arc
    // + yradius of the ellipse arc
    // + start angle of the ellipse arc, between 0 and 2pi, where 0 points at the xaxis
    // + end angle of the arc, between 0 and 2pi, greater than the start angle
    //
    // **returns**
    // + a CurveData object representing a NURBS curve
    //

    public static function ellipse_arc( center : Point, xaxis : Point, yaxis : Point, xradius : Float,
                                        yradius : Float, startAngle : Float, endAngle : Float ) : CurveData {


        // if the end angle is less than the start angle, do a circle
        if (endAngle < startAngle) endAngle = 2.0 * Math.PI + startAngle;

        var theta = endAngle - startAngle
        , numArcs = 0;

        // how many arcs?
        if (theta <= Math.PI / 2) {
            numArcs = 1;
        } else {
            if (theta <= Math.PI){
                numArcs = 2;
            } else if (theta <= 3 * Math.PI / 2){
                numArcs = 3;
            } else {
                numArcs = 4;
            }
        }

        var dtheta = theta / numArcs
        , n = 2 * numArcs
        , w1 = Math.cos( dtheta / 2)
        , P0 = Vec.add( center, Vec.add( Vec.mul( xradius * Math.cos(startAngle), xaxis), Vec.mul( yradius * Math.sin(startAngle), yaxis ) ) )
        , T0 = Vec.sub( Vec.mul( Math.cos(startAngle), yaxis ), Vec.mul( Math.sin(startAngle), xaxis) )
        , controlPoints = []
        , knots = Vec.zeros1d( 2 *numArcs + 3 )
        , index = 0
        , angle = startAngle
        , weights = Vec.zeros1d( numArcs * 2 );

        controlPoints[0] = P0;
        weights[0] = 1.0;

        for (i in 1...numArcs+1){

            angle += dtheta;
            var P2 = Vec.add( center,
                                Vec.add( Vec.mul( xradius * Math.cos(angle), xaxis), Vec.mul( yradius * Math.sin(angle), yaxis ) ) );

            weights[index+2] = 1;
            controlPoints[index+2] = P2;

            var T2 = Vec.sub( Vec.mul( Math.cos(angle), yaxis ), Vec.mul( Math.sin(angle), xaxis) );

            var params = Intersect.rays(P0, Vec.mul( 1 / Vec.norm(T0), T0), P2, Vec.mul( 1 / Vec.norm(T2), T2));
            var P1 = Vec.add( P0, Vec.mul(params[0], T0));

            weights[index+1] = w1;
            controlPoints[index+1] = P1;

            index += 2;

            if (i < numArcs){
                P0 = P2;
                T0 = T2;
            }
        }

        var j = 2 * numArcs + 1;

        for (i in 0...3){
            knots[i] = 0.0;
            knots[i+j] = 1.0;
        }

        switch (numArcs){
            case 2:
                knots[3] = knots[4] = 0.5;
            case 3:
                knots[3] = knots[4] = 1/3;
                knots[5] = knots[6] = 2/3;
            case 4:
                knots[3] = knots[4] = 0.25;
                knots[5] = knots[6] = 0.5;
                knots[7] = knots[8] = 0.75;
        }

        return new CurveData( 2, knots, Eval.homogenize_1d( controlPoints, weights ));
    }


    //
    // Generate the control points, weights, and knots of an arbitrary arc
    // (Corresponds to Algorithm A7.1 from Piegl & Tiller)
    //
    // **params**
    // + the center of the arc
    // + the xaxis of the arc
    // + orthogonal yaxis of the arc
    // + radius of the arc
    // + start angle of the arc, between 0 and 2pi
    // + end angle of the arc, between 0 and 2pi, greater than the start angle
    //
    // **returns**
    // + a CurveData object representing a NURBS curve
    //

    public static function arc( center, xaxis, yaxis, radius, start_angle, end_angle ) {
        return ellipse_arc( center, xaxis, yaxis, radius, radius, start_angle, end_angle );
    }


    //
    // Generate the control points, weights, and knots of a polyline curve
    //
    // **params**
    // + array of points in curve
    //
    // **returns**
    // + a CurveData object representing a NURBS curve
    //

    public static function polyline_curve( pts : Array<Point>) : CurveData {

        var knots = [0.0,0.0];
        var lsum = 0.0;

        for (i in 0...pts.length-1) {
            lsum += Vec.dist( pts[i], pts[i+1] );
            knots.push( lsum );
        }
        knots.push( lsum );

        // normalize the knot array
        knots = Vec.mul( 1 / lsum, knots );

        var weights = [ for (i in 0...pts.length) 1.0 ];

        return new CurveData( 1, knots, Eval.homogenize_1d(pts.slice(0), weights ));

    }

    //
    // Generate the control points, weights, and knots of an extruded surface
    //
    // **params**
    // + axis of the extrusion
    // + length of the extrusion
    // + a CurveData object representing a NURBS surface
    //
    // **returns**
    // + an object with the following properties: control_points, weights, knots, degree
    //

    public static function extruded_surface( axis : Point, length : Float, profile : CurveData ) : SurfaceData {

        var control_points = [[],[],[]]
        , weights = [[],[],[]];

        var prof_control_points = Eval.dehomogenize_1d( profile.controlPoints );
        var prof_weights = Eval.weight_1d( profile.controlPoints );

        var translation = Vec.mul( length, axis );
        var halfTranslation = Vec.mul( 0.5 * length, axis );

        // original control points
        for (j in 0...prof_control_points.length){

            control_points[2][j] = prof_control_points[j];
            control_points[1][j] = Vec.add( halfTranslation, prof_control_points[j] );
            control_points[0][j] = Vec.add( translation, prof_control_points[j] );

            weights[0][j] = prof_weights[j];
            weights[1][j] = prof_weights[j];
            weights[2][j] = prof_weights[j];
        }

        return new SurfaceData( 2, profile.degree, [0,0,0,1,1,1], profile.knots, Eval.homogenize_2d( control_points, weights) );
    }


}