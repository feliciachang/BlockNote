import { StyleSheet, Text, View } from "@react-pdf/renderer";

// https://github.com/diegomura/react-pdf/issues/134

const PIXELS_PER_POINT = 0.75;
const styles = StyleSheet.create({
  listItem: {
    display: "flex",
    flexDirection: "row",
    gap: 8 * PIXELS_PER_POINT,
    // width: "100%",
  },
  bullet: {
    fontFamily: "", // TODO: add symbol font
  },
  //   bullet: {
  //     marginTop: FONT_SIZE,
  //   },
});

export const BULLET_MARKER = "\u2022";
export const CHECK_MARKER_UNCHECKED = "\u2610";
export const CHECK_MARKER_CHECKED = "\u2611";

export const ListItem = ({
  listMarker,
  children,
}: {
  listMarker: string;
  children: React.ReactNode;
}) => {
  return (
    <View style={styles.listItem}>
      <View style={styles.bullet}>
        {/* <Svg width={2} height={2}>
            <Circle cx="1" cy="1" r="2" fill="black" />
          </Svg> */}
        <Text>{listMarker}</Text>
      </View>
      {children}
    </View>
  );
};
